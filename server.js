const pass = process.env['password']
const fs = require('fs');
const proc = require('child_process');
const WebSocket = require('ws').WebSocketServer;
const VncClient = require('vnc-rfb-client');
const jimp = require('jimp');
const express = require('express');
const app = express();
const httpServer = require('http').createServer();
app.use(express.static('webapp'));
const ws = new WebSocket({
  server:httpServer
},function(){
  console.log("Websocket server listening on port 3000");
});
httpServer.on('request',app);

const initOptions = {
    debug: false, // Set debug logging
    encodings: [ // Encodings sent to server, in order of preference
        VncClient.consts.encodings.copyRect,
        VncClient.consts.encodings.zrle,
        VncClient.consts.encodings.hextile,
        VncClient.consts.encodings.raw,
        VncClient.consts.encodings.pseudoDesktopSize,
        VncClient.consts.encodings.pseudoCursor
    ],
   debugLevel: 1 // Verbosity level (1 - 5) when debug is set to true
};
const client = new VncClient(initOptions);
const usersOnline = 0;
const usersList = [];
let frame;


//start vm
//qemu-system-x86_64 -cdrom ~/replvm/winpe_xp -m 128 -vnc 127.0.0.1:5900 -monitor stdio -L lib
const qemu = proc.spawn('qemu-system-x86_64',['-cdrom ~/replvm/winpe_xp.iso','-m 128','-vnc 127.0.0.1:5900','-monitor stdio','-L lib']);
qemu.stdout.on('data', function(data) {
    console.log(data);
});

//connect to vnc
client.changeFps(1);
client.connect({
  host:"127.0.0.1",
  port:5900,
  set8BitColor: false,
  password:""
});

function broadcast(data) {
  ws.clients.forEach(client => client.send(data));
};
client.on('frameUpdated',function(img){
    new jimp({
      width:client.clientWidth,
      height:client.clientHeight,
      data: client.getFb()
    },function(){ 
      f.send(encode(['png','12','1','0','0',img.getBase64Async(jimp.AUTO)]));
    });
});

ws.on('connection',function(f){
  console.log("we have a connection!");
  f.send(encode(['adduser']))
  f.on('message',function(msg){
    array = new Uint8Array(msg);
    let message = "";
    array.forEach(function (h) {
      let char = String.fromCharCode(h);
      message += char
    });
    message = decode(message);
    console.log(message);
    let username;
    let rank = '0';
    let joined = false;
    if (message[0] == 'rename'){
      oldusername = username;
      username = message[1];
      if (!joined){
        let modifiedUsers = usersList;
        modifiedUsers.unshift('adduser');
        f.send(encode(modifiedUsers))
        usersList.push(username);
        usersList.push(rank);
        broadcast(encode(['adduser',usersOnline.toString(),username,'0']))
      }else{
        broadcast(encode(['rename','1',oldusername,username,'0']));
      }
      f.on('closed',function(){
        broadcast(encode(['remuser','1',username]));
      })
    }
    if (message[0] == 'chat'){
      broadcast(encode(['chat',username,message[1]]));
    }
    if (message[0] == 'list'){
      f.send(encode(['list','replvm','Windows PE 1.0',fs.readFileSync('thumbnail.png', {encoding: 'base64'})]));
    }
    if (message[0] == 'admin'){
      broadcast(encode(['chat',username,message[1]]));
    }
    if (message[0] == 'key'){
      if(message[2] == '1'){
        client.sendKeyEvent(message[1],true);
      }else{
        client.sendKeyEvent(message[1],false);
      }
    }
    if (message[0] == 'mouse'){
      if (message[3] == "1"){
        client.sendPointerEvent(message[1], message[2], true, false, false, false, false, false, false, false);
      }
      if (message[3] == "2"){
        client.sendPointerEvent(message[1], message[2], false, true, false, false, false, false, false, false);
      }
      if (message[3] == "4"){
        client.sendPointerEvent(message[1], message[2], false, false, false, true, false, false, false, false);
      }
    }
    if (message[0] == 'admin'){
      if (message[1] == '2'){
        if (message[2] == pass){
          rank = '3';
        }
      }
      if (message[1] == '5'){
        qemu.stdin.write(message[3]);
      }
    }
  })
})

function decode(cypher) {
	var sections = [];
	var bump = 0;
	while (sections.length <= 50 && cypher.length >= bump) {
		var current = cypher.substring(bump);
		var length = parseInt(current.substring(current.search(/\./) - 2));
		var paramater = current.substring(length.toString().length + 1, Math.floor(length / 10) + 2 + length);
		sections[sections.length] = paramater;
		bump += Math.floor(length / 10) + 3 + length;
	}
	sections[sections.length - 1] = sections[sections.length - 1].substring(0, sections[sections.length - 1].length - 1);
	return sections;
}
function encode(cypher) {
  //console.log(cypher);
	var command = "";
	for (var i = 0; i < cypher.length; i++) {
		var current = cypher[i];
		command += current.length + "." + current;
		command += (i < cypher.length - 1 ? "," : ";");
	}
	return command;
}
httpServer.listen(3000);
console.log("Server started on port 3000");
