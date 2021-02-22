const ROUTER = require('./routes/routes.js');
const PATH = require('path');


function useMiddlewares(APP, EXPRESS) {
    // set template engine
    APP.set("view engine", 'ejs');

    // set static file serving path
    APP.use(EXPRESS.static(PATH.join(__dirname, 'public')));

    // middleware to parse body into json
    APP.use(EXPRESS.json());

    // middleware for parsing body of POST requests
    APP.use(EXPRESS.urlencoded({extended: false}));

    // set routes
    APP.use(ROUTER);
};

module.exports = {useMiddlewares};