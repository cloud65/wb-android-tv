'use strict';
const {
    AndroidRemote,
    RemoteKeyCode,
    RemoteDirection
} = require("androidtv-remote");

const mqtt = require('mqtt');
const fs = require('node:fs');


const config = {};
config.mqtt = {host: "localhost", port: 1883};
config.devices = [
	{name: "tv1", host: "192.168.18.20"}
];

config.devices.forEach(dev=>{
	Object.assign(dev, {power: false, mute:false, volume: -1, newVolume: 0, values: {}})
})


const client = mqtt.connect(`mqtt://${config.mqtt.host}`, {
    port: config.mqtt.port,
    username: config.mqtt.user,
    password: config.mqtt.password
});



const topics = [
   {name: "power", type: "swith"},
   {name: "input_source", type: "swith"}, //!
   {name: "channel", type: "range"},
   {name: "volume", type: "range"},
   {name: "backlight", type: "swith"},
   {name: "controls_locked", type: "swith"},
   {name: "mute", type: "swith"},
   {name: "pause", type: "swith"},
   {name: "code", type: "text"}
]

const saveCerts=async (dev, cert)=>{
	fs.readFile("keys.json", (err, json)=>{
		let data = {};
		if (!err) {
			data = JSON.parse(json);
		}		
		data[dev.name] = cert
		json = JSON.stringify(data)
		fs.writeFile("keys.json", json, ()=>null)
	})
}

const readCerts=(dev)=>{
	let data = {};
	try {
		data = JSON.parse(fs.readFileSync("keys.json"));
	}catch {
		data = {};
	}
	
	return data[dev.name] || {"cert": null, key: null};
}

const initAndroidTV=()=>{
  config.devices.forEach(dev=>{	  
	  const options = {pairing_port : 6467, remote_port : 6466,   service_name : "Service: " + dev.name, cert:readCerts(dev)};
	  dev.androidRemote = new AndroidRemote(dev.host, options);
	  
	  dev.androidRemote.on('volume', (volume) => {
		  if (dev.volume===-1) {
			client.publish(`/devices/${dev.name}/controls/volume`, String(volume.level));
			dev.newVolume=volume.level;
		  }
		  
		  dev.volume = volume.level;
		  
		  if (!volume.muted){
			if  (dev.volume<dev.newVolume) dev.androidRemote.sendKey(RemoteKeyCode.KEYCODE_VOLUME_UP, RemoteDirection.SHORT)
				else if  (dev.volume>dev.newVolume) dev.androidRemote.sendKey(RemoteKeyCode.KEYCODE_VOLUME_DOWN, RemoteDirection.SHORT)
		  }
	
		  client.publish(`/devices/${dev.name}/controls/mute`, volume.muted?"1":"0");
		  dev.mute = volume.muted;
		  
		  
		  
		  
		  console.debug("Volume : " + volume.level + '/' + volume.maximum + " | Muted : " + volume.muted);
	  });
	  
	  dev.androidRemote.on('powered', (powered) => {
		 const val = powered? "1": "0";
		 client.publish(`/devices/${dev.name}/controls/power`, val);
		 dev.power = val=="1";
		 
         console.debug("Powered : " + powered)
	  });
	  
	  dev.androidRemote.on('current_app', (current_app) => {
		 //client.publish(`/devices/${dev.name}/controls/volume`, String(volume.level));
         console.debug("current_app : " + current_app)
	  });
	  
	  dev.androidRemote.on('error', (err) => {
		 //client.publisherrordevices/${dev.name}/controls/volume`, String(volume.level));
         console.debug("Powered : " + err)
	  });

	  
	  dev.androidRemote.on('secret', () => {
		client.publish(`/devices/${dev.name}/controls/code/meta/readonly`, "0");
		client.publish(`/devices/${dev.name}/controls/code`, "");

	  });  
	  dev.androidRemote.start()
  }) 
}

const sendCode=(dev, code)=> {
	if (!code) return;
	dev.androidRemote.sendCode(code);
	client.publish(`/devices/${dev.name}/controls/code/meta/readonly`, "1");
	client.publish(`/devices/${dev.name}/controls/code`, "");
	
	saveCerts(dev, dev.androidRemote.getCertificate())
	
	
}



const onMessage=(topic, msg) => {
  const arrTopic = topic.split("/"); 
  const dev = config.devices.find(e=>e.name===arrTopic[2].toLowerCase());
  
  
  const action = arrTopic[4].toLowerCase();
  
  const message = msg.toString();
  
  console.log(topic, message)
  if (!dev.values[action]) {
		dev.values[action] = true;
		return;
  }
  
  
  switch (action) {
	 case 'power':	
		if  (dev.power!==(message=="1")) dev.androidRemote.sendKey(RemoteKeyCode.KEYCODE_POWER, RemoteDirection.SHORT);	
		break;
	 //----------------------------------	
	 case 'input_source':
		
		break;
	 //----------------------------------
	 case 'channel':
		
		break;
	 //----------------------------------
	 case 'volume':
	    dev.newVolume = Number(message);
		if  (dev.volume<dev.newVolume) dev.androidRemote.sendKey(RemoteKeyCode.KEYCODE_VOLUME_UP, RemoteDirection.SHORT)
			else if  (dev.volume>dev.newVolume) dev.androidRemote.sendKey(RemoteKeyCode.KEYCODE_VOLUME_DOWN, RemoteDirection.SHORT)		
		break;
	 //----------------------------------
	 case 'backlight':
		
		break;
	 //----------------------------------
	 case 'controls_locked':
		
		break;
	 //----------------------------------
	 case 'mute':
		if  (dev.mute!==(message=="1")) dev.androidRemote.sendKey(RemoteKeyCode.KEYCODE_VOLUME_MUTE, RemoteDirection.SHORT);		
		break;
	 //----------------------------------
	 case 'pause':
		dev.androidRemote.sendKey(message=="0" ? RemoteKeyCode.KEYCODE_MEDIA_PLAY : RemoteKeyCode.KEYCODE_MEDIA_PAUSE, RemoteDirection.SHORT);
		break;
     //----------------------------------
	 case 'code':
		//client.
	    sendCode(dev, message) 		
		break;
	 //----------------------------------
	 default:
		console.log('Unknown action Type: ' + action);	
  }		
}


client.on("connect", () => {
  config.devices.forEach(dev=>{
	  client.subscribe(topics.map(item => `/devices/${dev.name}/controls/${item.name}`));
  
	  client.on('message', onMessage);
	  
	  client.publish(`/devices/${dev.name}/controls/code/meta/readonly`, "1");
	  client.publish(`/devices/${dev.name}/controls/code`, "");
	  initAndroidTV();
  })  
}); 


client.on('offline', () => {
	client.end();
});

