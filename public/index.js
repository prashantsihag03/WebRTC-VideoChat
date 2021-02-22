// make socket connection
const SOCKET = io();

// connection info holder
let receivingCall = [];
let activeCall = { 
    state: 'empty',
    instance: null,
    peer: null,
    roomId: null 
};

// RTC configurations
let config = {
    iceServers: [
        {
            'urls': 'stun:stun.stunprotocol.org'
        }
    ]
};

// frequently used DOM elements
let localVideo = document.getElementById('localVideo');
let peerVideo = document.getElementById('peerVideo');
let home = document.getElementById('home');
let callUpdate = document.getElementById('call-update');
let caller = document.getElementById('caller');
let callerP = document.getElementById('callee');
let callContainer = document.getElementById('callContainer');
let ringerName = document.getElementById('ringer-name');
let ringerWarning = document.getElementById('ringer-warning');

document.getElementById("end").addEventListener("click", () => {
    if (activeCall.roomId != null) {
        let detail = {
            from: activeCall.peer,
            roomId: activeCall.roomId
        };
        rejectCall(detail);
    } else {
        resetCallData();
    };
});

// set initial view to home
handleView("home");

// call event listener
document.getElementById('call').addEventListener('click', () => {    
    let callTo = document.getElementById('connectWith').value;
    callTo = callTo.trim();
    callTo = callTo.toLowerCase();
    SOCKET.emit('forwardCall', (JSON.stringify({ to: callTo })));
    activeCall.state = "precall";
    activeCall.peer = callTo;
});

SOCKET.on('ack', (receivedPayload) => {
    receivedPayload = JSON.parse(receivedPayload);
    console.log("Acknowledgement: " + receivedPayload.status);

    if (receivedPayload.status == "receiver offline") {
        callUpdate.innerHTML = "User is Offline";
        handleView("home");
        resetCallData();

    } else if (receivedPayload.status == "rejected") {
        callerP.innerHTML = "call rejected";
        callerP.style.color = "maroon";
        handleView("home");
        resetCallData();

    } else if (receivedPayload.status == "calling") {
        if (activeCall.state == "precall") {
            // update activeCall
            activeCall.state = "calling";  
            activeCall.instance = new RTCPeerConnection(config); 
            // display call card
            callerP.innerHTML = "calling " + activeCall.peer;
            callerP.style.color = "black";     
            handleView("caller");
        };
    };
});

SOCKET.on('rejected', (receivedPayload) => {
    if (activeCall.state == "calling") {
        console.log("Call rejected by " + activeCall.peer);
        resetCallData();
        handleView("home");
    } else if (activeCall.state == "active") {
        console.log("Call Ended");
        resetCallData();
        handleView("home");
    };
});

SOCKET.on('call', (receivedPayload) => {
    receivedPayload = JSON.parse(receivedPayload);
    console.log("Receiving call from " + receivedPayload.from);
    // check if a call is active or not
    if (activeCall.state != "empty") {
        // user on other call
        // show pop up with options 
        // to close this one and jump onto other one
        // or decline other one
    }
    receivingCall.push(receivedPayload.from);
    // show call UI
    showCallUI(receivedPayload);
});

SOCKET.on('offer', async (receivedPayload) => {
    receivedPayload = JSON.parse(receivedPayload);
    activeCall.roomId = receivedPayload.roomId;

    console.log("Offer received for roomId: " + receivedPayload.roomId);
    getCallDetail();

    if (activeCall.state == "calling") {

        // display container for local and peer videos 
        handleView("callContainer");

        // on receiving tracks
        let peerVideo = document.getElementById('peerVideo');
        activeCall.instance.addEventListener('track', ({streams: [stream]}) => {
            // display on peer video element
            console.log("Track received from peer");
            peerVideo.srcObject = stream;
        });

        // set remote desc 
        console.log("Setting remote description");
        await activeCall.instance.setRemoteDescription(receivedPayload.offer);

        // add tracks 
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true, 
            video: true
        });

        // display local stream
        let localVideo = document.getElementById('localVideo');
        localVideo.srcObject = stream;

        // add stream to RTC connection
        stream.getTracks().forEach(track => activeCall.instance.addTrack(track, stream));

        // ice candidate event handler
        console.log("Setting ice candidate handler");
        activeCall.instance.onicecandidate = e => {
            console.log("New Ice candidate emitted.");
            // emit ice candidate to room
            SOCKET.emit('iceCandidate', JSON.stringify({
                roomId: receivedPayload.roomId,
                ICE: e.candidate
            }));
        };

        // create answer
        console.log("creating answer");
        let answer = await activeCall.instance.createAnswer();
        console.log("Setting local description");
        activeCall.instance.setLocalDescription(answer);

        // emit answer to room
        console.log("sending answer");
        SOCKET.emit('answer', (JSON.stringify({
            roomId: receivedPayload.roomId,
            answer: answer
        })));
        activeCall.state = "active";
    };
});

// remote peer sends new ice candidates - add them 
SOCKET.on('remoteIceCandidate', async (receivedPayload) => {
    receivedPayload = JSON.parse(receivedPayload);
    if (activeCall.instance.remoteDescription != null) {
        await activeCall.instance.addIceCandidate(receivedPayload.ICE);
    } else {
        console.log("Ice candidate received from peer and ignored since Remote not set yet.");
    };
    console.log("Ice candidate received from peer and added to connection.");
});

async function acceptCall(callData) {
    // display video containers and hide ringer containers
    handleView("callContainer");
    document.getElementById("ringer-container").style.left = "-100%";

    // update active call data
    activeCall.state = 'pending';
    activeCall.from = callData.from,
    activeCall.roomId = callData.id,

    console.log("Call accepted from " + callData.from);
    
    // add connection instance to activeCall
    activeCall.instance = new RTCPeerConnection(config);;

    // fetch media streams here
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
    });

    // display local stream
    localVideo.srcObject = stream;

    // add stream to RTC connection
    stream.getTracks().forEach(track => activeCall.instance.addTrack(track, stream));

    // on receiving tracks
    activeCall.instance.addEventListener('track', ({streams: [stream]}) => {
        // display on peer video element
        console.log("Track received from peer");
        peerVideo.srcObject = stream;
    });

    // local connection finds new ice candidates
    activeCall.instance.onicecandidate = e => {
        // emit ice candidate to room
        console.log("New Ice candidate emitted.");
        SOCKET.emit('iceCandidate', JSON.stringify({
            roomId: callData.id,
            ICE: e.candidate
        }));
    };

    // create offer
    let offer = await activeCall.instance.createOffer({
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 1
    });

    // set it as local description
    await activeCall.instance.setLocalDescription(offer);

    // send offer to remote peer
    SOCKET.emit('offer', (JSON.stringify({
        roomId: callData.id,
        offer: offer
    })));

    // received answer from peer
    SOCKET.on('answer', async (receivedPayload) => {
        receivedPayload = JSON.parse(receivedPayload);
        console.log("Answer received from " + receivedPayload.roomId);
        if (receivedPayload.roomId == activeCall.roomId) {
            await activeCall.instance.setRemoteDescription(receivedPayload.answer);
            activeCall.state = 'active';
        } else {
            console.log("Room id of answer do not match with activeCall roomid")
        };
    });
};

// reject call
function rejectCall(callData) {
    console.log("Rejecting call.");
    receivingCall.splice(receivingCall.indexOf(callData.from), 1);
    SOCKET.emit('callReject', JSON.stringify({roomId: callData.roomId}));
    if (activeCall.instance != null) {
        // ongoing call is getting ended
        activeCall.instance.close();
    };
    resetCallData();
};

// display call details on page
function showCallUI(receivedPayload) {
    // update caller name
    ringerName.innerHTML = receivedPayload.from + " calling..";

    // update accept button 
    let acceptBtn = document.getElementById("acceptBtn");
    acceptBtn.addEventListener('click', () => {
        clearInterval(ringerInterval);
        acceptCall(receivedPayload);
    });

    // update reject button
    let rejectBtn = document.getElementById('rejectBtn');
    rejectBtn.addEventListener('click', () => {
        // hide ringer container
        document.getElementById("ringer-container").style.left = "-100%";
        rejectCall(receivedPayload);
    });

    // show Call UI and start timer
    document.getElementById("ringer-container").style.left = "0%";

    // set interval for ringer timer
    let i = 19;
    ringerInterval = setInterval(() => {
        i = i - 1;
        ringerWarning.innerHTML = "Pick up in " + i;
        if (i == 0) {
            clearInterval(ringerInterval);
            document.getElementById("ringer-container").style.left = "-100%";
            console.log("Missed Call.");
            rejectCall(receivedPayload);
        };
    }, 1000);    
};

function getCallDetail() {
    console.log("Active Call details are: ");
    console.log("State: " + activeCall.state);
    console.log("RoomId: " + activeCall.roomId);
    console.log("Instance: " + activeCall.instance);
};

function handleView(element_to_lift) {

    if (element_to_lift == "caller") {
        callContainer.style.right = "-100%";
        home.style.right = "-100%";
        caller.style.right = "0%";

    } else if (element_to_lift == "home") {
        callContainer.style.right = "-100%";
        caller.style.right = "-100%";
        home.style.right = "0%";

    } else if (element_to_lift == "callContainer") {
        caller.style.right = "-100%";
        home.style.right = "-100%";
        callContainer.style.right = "0%";
    };

};

function resetCallData() {
    activeCall.state = 'empty';
    if (activeCall.instance != null) {
        activeCall.instance.close();
    };
    activeCall.instance = null;
    activeCall.instance = null;
    activeCall.peer = null;
    activeCall.roomId = null;
    console.log("Active Call data cleared.");
};

