
// this file includes all functions
function validateString(aString) {
    astring = aString.toLowerCase();
    aString = aString.trim();
    // also use regex to validate further
    return aString;
};

function isUserOnline(usernameToCheck, onlineUsers) {
    // get usernameToCheck's record from onlineUsers
    let userOnline = onlineUsers.find(user => user.username == usernameToCheck);
    if (userOnline != undefined) {
        if (userOnline.username == usernameToCheck) {
            return userOnline;
        };
        return false;
    }; 
    // record does not exist
    return false;
};

function getUserData(socket, onlineUsers) {
    let user = onlineUsers.find(user => user.socket.id == socket.id);
    if (user != undefined) {
        return user;
    };
    return false;
};

module.exports = {
    validateString,
    isUserOnline,
    getUserData
};