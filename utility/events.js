// dependencies
const COOKIE = require('cookie');
const UTILS = require('./utils.js');
const { v4: uuidv4 } = require('uuid');

let onlineUsers = [];
let allRooms = [];

// main handler for socket connection
function connectionEvent(socket, SignalSocket) {
    let thisUser = goOnline(socket);

    // call forwarding event
    socket.on("forwardCall", receivedPayload => forwardCall(socket, receivedPayload, thisUser));

    // offer event
    socket.on('offer', receivedPayload => forwardOffer(socket, receivedPayload));

    // answer event
    socket.on('answer', receivedPayload => forwardAnswer(socket, receivedPayload));

    // ice candidate event
    socket.on('iceCandidate', receivedPayload => forwardIceCandidate(socket, receivedPayload));

    // call rejection event
    socket.on('callReject', receivedPayload => endCall(socket, receivedPayload));

    // disconnecting event
    socket.on("disconnecting", () => disconnecting(socket));

    // disconnect event
    socket.on("disconnect", cause => console.log("Socket Disconnected due to " + cause));
};

// socket events functions -----------------------------------------------E V E N T S------
function forwardCall(socket, receivedPayload, thisUser) {
    // parse and validate received payload
    receivedPayload = JSON.parse(receivedPayload);
    receivedPayload.to = UTILS.validateString(receivedPayload.to);
    console.log("Calling " + receivedPayload.to + " from " + thisUser.username);

    // if receiver is offline, exit with ack to call initiator 
    let callReceiver = UTILS.isUserOnline(receivedPayload.to, onlineUsers);
    if(!callReceiver) {
        sendAck(socket, `receiver offline`);
        return;
    };
    sendAck(socket, `calling`);

    // receiver is online
    console.log(receivedPayload.to + " is Online. Creating room with it");

    // create room and add call initiator and receiver in it.
    let room = {
        roomId: uuidv4(),
        members: [thisUser.username, callReceiver.username]
    };

    console.log("Room created with roomID: " + room.roomId);
    // adding room to allRooms list
    allRooms.push(room);

    // make this user join room
    socket.join(room.roomId);
    // update this user's record in allUsers
    let userRecord = onlineUsers.find(user => user.username == thisUser.username);
    onlineUsers[onlineUsers.indexOf(userRecord)].roomJoined = room.roomId;
    
    // make call receiver join the room
    callReceiver.socket.join(room.roomId);
    // update this user's record in allUsers
    userRecord = onlineUsers.find(user => user.username == callReceiver.username);
    onlineUsers[onlineUsers.indexOf(userRecord)].roomJoined = room.roomId;

    sendAck(socket, `Room ${room.roomId}`);
    sendAck(socket, `Waiting for ${callReceiver.username}'s response`);

    // emit call event to call receiver
    socket.to(room.roomId).emit("call", (JSON.stringify({
        from: thisUser.username, id: room.roomId
    })));
};

// function to handle offer event
function forwardOffer(socket, receivedPayload) {
    receivedPayload = JSON.parse(receivedPayload);
    // forward the offer to other person in room
    console.log("Request received to forward OFFER in room: " + receivedPayload.roomId);

    //check if this room Id exists
    if ((allRooms.find(room => room.roomId == receivedPayload.roomId)) != undefined) {
        socket.to(receivedPayload.roomId).emit('offer', (JSON.stringify(receivedPayload)));
        console.log("Offer forwarded into room.");
    } else {
        console.log("Room Id does not exists.");
        sendAck(socket, 'This room id does not exits. Offer sending failed.');
    };
};

// function to handle answer event
function forwardAnswer(socket, receivedPayload) {
    console.log("Received answer");
    receivedPayload = JSON.parse(receivedPayload);

    // check if room exist
    if (doesRoomExist(receivedPayload.roomId)) {
        // forward answer in room
        console.log("Room exists. forwarding answer");
        socket.to(receivedPayload.roomId).emit('answer', (JSON.stringify(receivedPayload)));
    } else {
        sendAck(socket, 'Room does not exist. Answer signalling failed !');
    };
};

// function to handle answer event
function forwardIceCandidate(socket, receivedPayload) {
    receivedPayload = JSON.parse(receivedPayload);
    //check if this room Id exists
    if ((allRooms.find(room => room.roomId == receivedPayload.roomId)) != undefined) {
        socket.to(receivedPayload.roomId).emit('remoteIceCandidate', (JSON.stringify(receivedPayload)));
    } else {
        console.log("Room Id does not exists.");
        sendAck(socket, 'This room id does not exits. Ice forwarding failed.');
    };
};

// call rejected or disconnected
function endCall(socket, receivedPayload) {
    console.log("EndCall fiunction exexcuting");
    receivedPayload = JSON.parse(receivedPayload);
    // check if room exists
    if (doesRoomExist(receivedPayload.roomId)) {
        socket.to(receivedPayload.roomId).emit('rejected', JSON.stringify({message: 'Rejected'}));
        let thisUser = UTILS.getUserData(socket);
        if (thisUser == false) {
            console.log("endCall function line 135");
        };
        remove_member_from_room(receivedPayload.roomId, thisUser.username);
    };
};

// socket utility functions --------------------------------------- U T I L I T Y ---------
function remove_member_from_room(roomid, thisMember) {
    // get the roomid index in allRooms
    let roomid_Index = allRooms.findIndex(room => room.roomId == roomid);

    // get the index of thisMember in allRooms[roomid_Index]'s members list
    let member_Index = allRooms[roomid_Index].members.findIndex(member => member == thisMember);

    // update its member's list
    allRooms[roomid_Index].members.splice(member_Index, 1);
    console.log(thisMember + " removed from a room");

    // check if the room is empty
    if (allRooms[roomid_Index].members.length < 1) {
        console.log("Room with id: " + allRooms[roomid_Index].roomId + " went silent. Deleting room..");
        // delete this room id from allRooms record
        allRooms.splice(roomid_Index, 1);
    };
};

function doesRoomExist(id) {
    let roomExist = allRooms.find(room => room.roomId == id);
    if (roomExist != undefined) {
        return true;
    };
    return false;
};

function validateSocketConnection(socket, next) {
    // check cookies / Authenticate user
    if (!socket.request.headers.cookie) {
        next(new Error("Not Authorised."));
    };
    // parse cookies 
    let cookies = socket.request.headers.cookie;
    cookies = COOKIE.parse(cookies);
    // validate cookies
    if (!cookies.username) {
        console.log("Username not available in cookies. Rejecting socket connection.");
        socket.disconnect(true);
        next(new Error("Not Authorised."));
    };
    next();
};
function disconnecting(socket) {
    // get this user from onlineUser list
    let thisUser_Index = onlineUsers.findIndex(user => user.socket == socket);
    let thisUser = onlineUsers[thisUser_Index];
    console.log(thisUser.username + " disconnecting.");

    // remove this member from the joined room if any
    if (onlineUsers[thisUser_Index].roomJoined != null) {
        console.log("Removing "+thisUser.username+" from rooms.");
        remove_member_from_room(thisUser.roomJoined, thisUser.username);
    };

    // remove this user from onlineUsers list
    onlineUsers.splice(thisUser_Index, 1);
    console.log(thisUser.username + " disconnected.");
};

function goOnline(socket) {
    // parse raw cookies
    let cookies = COOKIE.parse(socket.request.headers.cookie);
    // add user into onlineUsers list
    let thisUser = {
        username: UTILS.validateString(cookies.username),
        socket: socket,
        roomJoined: null
    };
    onlineUsers.push(thisUser);
    console.log(cookies.username + " connected");
    // ack client that it is connected
    sendAck(socket, "Socket Connected.");

    return thisUser;
};

// function to send acknowledgement
function sendAck(socket, ackMsg) {
    let ack = {
        status: UTILS.validateString(ackMsg)
    };
    socket.emit("ack", JSON.stringify(ack));
};

// ----------------------------------------------------------------- E X P O R T ----------
module.exports = {
    connectionEvent, 
    validateSocketConnection, 
    allRooms, onlineUsers
};
