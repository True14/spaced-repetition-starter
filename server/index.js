const path = require('path');
const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const BearerStrategy = require('passport-http-bearer').Strategy;
const mongoose = require('mongoose');
const {User} = require('./models');
const {DATABASE_URL, PORT} = require('./config');
mongoose.Promise = global.Promise;


let secret = {
  CLIENT_ID: process.env.CLIENT_ID,
  CLIENT_SECRET: process.env.CLIENT_SECRET
};

if(process.env.NODE_ENV !== 'production') {
  secret = require('./secret');
}

const app = express();

const database = {
};

app.use(passport.initialize());

passport.use(
    new GoogleStrategy({
      clientID:  secret.CLIENT_ID,
      clientSecret: secret.CLIENT_SECRET,
      callbackURL: '/api/auth/google/callback'
    },
    (accessToken, refreshToken, profile, cb) => {
      // console.log('Access Token',accessToken,'Profile',profile);
        // Job 1: Set up Mongo/Mongoose, create a User model which store the
        // google id, and the access token
        // Job 2: Update this callback to either update or create the user
        // so it contains the correct access token
      // const user = database[accessToken] = {
      //   googleId: profile.id,
      //   accessToken: accessToken
      // };
      // console.log('User: ',user,'database: ', database);
      let user;
      User
        .findOne({googleId: profile.id})
        .exec()
        .then(_user => {
          user = _user;
          if(!user) {
            return User.create({
              googleId: profile.id,
              accessToken: accessToken
            });
          }
          return User
            .findByIdAndUpdate(user.id, {accessToken: accessToken},{new: true})
            .exec();
        })
        .then(user => {
          return cb(null, user);
        })
        .catch(err => console.log('error'));
    }
));

passport.use(
    new BearerStrategy((token, done) => {
            // Job 3: Update this callback to try to find a user with a
            // matching access token.  If they exist, let em in, if not,
            // don't.
      User
        .find({accessToken: token})
        .exec()
        .then(user => {
          if (!user) {
            return done(null, false);
          }
          return done(null, user[0].accessToken);
        })
        .catch(err => console.log(err));
    })
);

app.get('/api/auth/google',
    passport.authenticate('google', {scope: ['profile']}));

app.get('/api/auth/google/callback',
    passport.authenticate('google', {
      failureRedirect: '/',
      session: false
    }),
    (req, res) => {
      res.cookie('accessToken', req.user.accessToken, {expires: 0});
      res.redirect('/');
    }
);

app.get('/api/auth/logout', (req, res) => {
  req.logout();
  res.clearCookie('accessToken');
  res.redirect('/');
});

app.get('/api/me',
    passport.authenticate('bearer', {session: false}),
    (req, res) => {
      res.json({
        googleId: req.user.googleId
      });
    }
);

app.get('/api/questions',
    passport.authenticate('bearer', {session: false}),
    (req, res) => res.json(['Question 1', 'Question 2'])
);

// Serve the built client
app.use(express.static(path.resolve(__dirname, '../client/build')));

// Unhandled requests which aren't for the API should serve index.html so
// client-side routing using browserHistory can function
app.get(/^(?!\/api(\/|$))/, (req, res) => {
  const index = path.resolve(__dirname, '../client/build', 'index.html');
  res.sendFile(index);
});

let server;
function runServer(databaseUrl=DATABASE_URL, port=3001) {
  console.log('URL is', DATABASE_URL, 'Port is', port);
  return new Promise((resolve, reject) => {
    mongoose.connect(databaseUrl, err => {
      if (err) {
        return reject(err);
      }
      server = app.listen(port, () => {
        console.log(`Your app is listening on port ${port}`);
        resolve();
      }).on('error', err => {
        mongoose.disconnect();
        reject(err);
      });
    });
  });
}

function closeServer() {
  return new Promise((resolve, reject) => {
    server.close(err => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

if (require.main === module) {
  runServer();
}

module.exports = {
  app, runServer, closeServer
};
