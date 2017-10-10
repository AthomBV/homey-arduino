"use strict";

const http			= require('http');
const events		= require('events');
const dgram 		= require('dgram');

const ArduinoDevice = require('./ArduinoDevice');

class ArduinoDiscovery extends events.EventEmitter {
	
	constructor( opts ) {
		super();
		
		this._opts = Object.assign({
			debug: false,
			broadcastInterval: 30 * 1000, // 30s
			timeoutInterval: 60 * 1000 // 60s
		}, opts);
		
		this._scanning = false;
		this._devices = {};
		this._foundAddresses = [];
		
		this._deleteAfterTimeoutInterval = setInterval(this._deleteAfterTimeout.bind(this), this._opts.timeoutInterval);
	}
	
	_debug() {
		if( this._opts.debug ) {
			console.log.apply( null, arguments );
		}
	}
	
	start() {		
		if( this._scanning ) return;
		
		this._server = dgram.createSocket('udp4');
		this._server
			.on('listening', this._onServerListening.bind( this ))
			.on('message', this._onServerMessage.bind( this ))
			.bind(() => {
				this._server.setBroadcast(true);
			});
	}
	
	stop() {
		if( this._broadcastMessageInterval )
			clearInterval(this._broadcastMessageInterval);
		if ( this._deleteAfterTimeoutInterval )
			clearInterval(this._deleteAfterTimeoutInterval);
	}
	
	getDevices() {
		return this._devices;
	}
	
	getDevice( id ) {
		return this._devices[id] || new Error('invalid_arduino_device');
	}
	
	_broadcastMessage() {		
	    let ssdp_rhost = "255.255.255.255";
	    let ssdp_rport = 46639;
	    let ssdp_msg = '/\0';
	    let message = new Buffer(ssdp_msg);
	    this._server.send(message, 0, message.length, ssdp_rport, ssdp_rhost);
	}
	
	_deleteAfterTimeout() {
		let deleteIfLastSeenBefore = new Date( new Date().getTime() - this._opts.timeoutInterval);
		var keys = [];
		for (var k in this._devices) keys.push(k);
		var i = keys.length;
		while (i--) {
			let lastSeenOn = this._devices[keys[i]].getOpt('lastSeen');
			if (lastSeenOn < deleteIfLastSeenBefore) {
				if (!this._devices[keys[i]].getOpt('manuallyAdded')) {
					if (!this._devices[keys[i]].getOpt('paired')) {
						console.log('[DISCOVERY] Removed device',keys[i],'(No longer available)');
						delete this._devices[keys[i]];
					} else {
						console.log('[DISCOVERY] Device',keys[i],'is paired but no longer available.');
					}
				} else {
					console.log('[DISCOVERY] Device',keys[i],'could not be discovered but is flagged as manually added.');
				}
			}
		}
	}
	
	_onServerListening() {		
		this._broadcastMessage();
		if( this._broadcastMessageInterval )
			clearInterval(this._broadcastMessageInterval);
		this._broadcastMessageInterval = setInterval(this._broadcastMessage.bind(this), this._opts.broadcastInterval);
	}
	
	_onServerMessage( message, host ) {		
		message = message.toString();
		
		try {
			var opts = JSON.parse(message);
		} catch(e) {
			this._debug("[DISCOVERY] Received corrupt data from "+host.address+", ignoring packet.");
			this._debug("DUMP:",message);
			return;
		}
		
		opts.address = host.address;
		opts.port = host.port;
		
		if ( 'error' in opts ) {
			this._debug("[DISCOVERY] Received error message from "+host.address+": "+opts.error);
			return;
		}
		
		if ( !('id' in opts) ) return;
		if ( !('type' in opts) ) return;
		if ( !('api' in opts) ) return;
		
		opts.lastSeen = new Date();
		
		opts.debug = this._opts.debug;
						
		if ( this._devices[ opts.id ] instanceof ArduinoDevice ) {
			//this._debug("Device already in list: "+opts.id);
			this._devices[ opts.id ].update( opts );
			return;
		}
		
		this._devices[ opts.id ] = new ArduinoDevice( opts );
				
		this._debug("[DISCOVERY] New device: '"+opts.id+"'");
		
        this.emit('discover', this._devices[ opts.id ]);
	}
}
module.exports = ArduinoDiscovery;
