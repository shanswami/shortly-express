var express = require('express');
var session = require('express-session');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var knex = require('knex');
var bcrypt = require('bcrypt-nodejs');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
app.use(session({
  secret: 'keyboard cat',
  saveUninitialized: true,
  resave: true
}));

app.get('/', util.restrict,
function(req, res) {

  res.render('index');
});

app.get('/create', util.restrict,
function(req, res) {
  res.render('index');
});

app.get('/links', util.restrict,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/links', util.restrict,
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/login',
function(req, res) {
  res.render('login');
});

app.post('/login',
function(req, res) {
  console.log("hit the login POST route");
  new User({
    username: req.body.username
  })
  .fetch().then(function(found) {
    if (found) {
      var hashedPassword = found.attributes.password;
      if (bcrypt.compareSync(req.body.password, hashedPassword)) {
        console.log("correct password")
        req.session.regenerate(function(){
          req.session.user = found.attributes;
          res.redirect('/');
        });
      } else {
        console.log('wrong password dumbass');
        res.redirect('/login');
      }
    } else {
      console.log('USERNAME/PASSWORD COMBO INVALID');
      res.redirect('/login');
    }
  });
});

app.get('/logout',
  function(req,res) {
    console.log("logout route being hit");
    // req.session = null;
    req.session.destroy();
    res.redirect('/login');
  });

app.get('/signup',
function(req, res) {
  res.render('signup');
});

app.post('/signup',
function(req, res) {
  console.log('hit the signup POST route');

  new User({ username: req.body.username }).fetch().then(function(found) {
    if (found) {
      console.log('USERNAME ALREADY EXISTS');
      res.render('signup');
    } else {
      var user = {};
      user.username = (req.body.username);
      var password = (req.body.password);
      user.password = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
      var newUser = new User(user);
      newUser.save().then(function(newUser) {
        console.log("Created new user: " + newUser);
        req.session.regenerate(function(){
          Users.add(newUser);
          req.session.user = newUser;
          res.redirect('/');
        });
      });
    }
  });
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
