// dependencies - installed
const EXPRESS = require('express');
const SOCKETIO = require('socket.io');

// dependencies - inbuilt
const HTTP = require('http');

// module imports
const UTILS = require('./utility/utils.js');
const EVENTS = require('./utility/events.js');
const MIDDLEWARES = require('./middlewares.js');
 
// initialize express server instance
const APP = EXPRESS();

// create http server on Express server
const SERVER = HTTP.createServer(APP);

// using middlewares - see middlewware.js 
MIDDLEWARES.useMiddlewares(APP, EXPRESS);

// create socket.io server
const SignalSocket = SOCKETIO(SERVER);

// socket middlewares
SignalSocket.use((socket, next) => EVENTS.validateSocketConnection(socket, next));

// server listening
SERVER.listen(3000, () => console.log("Listening.........."));

// socket events
SignalSocket.on('connection', socket => EVENTS.connectionEvent(socket, SignalSocket));
