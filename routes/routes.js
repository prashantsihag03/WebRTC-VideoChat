// get express 
const EXPRESS = require('express');
const UTILS = require('../utility/utils.js');

// initialize router
const ROUTER = EXPRESS.Router();

// set routes
ROUTER.get('/', (request, response) => {
    response.clearCookie('username');
    response.render('login.ejs');
});

ROUTER.post('/dashboard', (request, response) => {    
    // fetch username from request body
    let username = request.body.username;

    // validate string
    username = UTILS.validateString(username);

    // set cookie for username
    response.cookie('username', username, {sameSite: 'lax', httpOnly: true, secure: false});

    // response
    response.render('index.ejs', {username: username});
});

module.exports = ROUTER;