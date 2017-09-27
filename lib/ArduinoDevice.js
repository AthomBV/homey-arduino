"use strict";

const events = require('events');
const rp = require('request-promise-native');
const express = require('express');
const bodyParser = require('body-parser');
const util = require('util');

class ArduinoDevice extends events.EventEmitter {
	
	constructor( opts ) {
		super();
		
		this._opts = Object.assign({
			id: 'unknown',
			address: '0.0.0.0',
			port: 46639,
			api: [],
			subscribed: false,
			debug: false,
			localPort: 0,
			localAddress: '0.0.0.0',
			lastSeen: null
		}, opts);
		
		this._webserver = express();
		
		this._triggerCb = function(){};
		
		this._webserver.get('/', (req, res) => {
			this._debug('Webserver: index requested');
			res.send('Nothing to see here.');
		});
		
		this._webserver.use(bodyParser.json());
		
		this._webserver.post('/trigger/*', (req, res) => {
			this._debug('Webserver: trigger requested ('+req.url+')');
			res.send('Triggered? '+req.url);
			try {
				var name = req.url.split('/')[2];
				var argument = req.body.argument;
				var type = req.body.type;
				this._debug(' - Name:',name);
				this._debug(' - Argument:',argument);
				this._debug(' - Type:',type);
				
				this.emit('trigger', {"name":name, "type":type, "argument":argument});
				
				/*try {
					this._triggerCb(name, type, argument);
				} catch(e) {
					this._debug("Error in trigger callback: ",e);
				}*/
			} catch(e) {
				this._debug(' - MISSING ARGUMENT');
			}
		});
		
		this._webserver.get('*', function(req, res){
			this._debug('Webserver: unknown GET route ('+req.url+')');
			res.send('???', 404);
		});
		
		this._webserver.post('*', function(req, res){
			this._debug('Webserver: unknown POST route ('+req.url+')');
			res.send('???', 404);
		});
		
		var listener = this._webserver.listen(0);
		this._opts.localPort = listener.address().port;		
	}
	
	update ( opts ) {
		this._debug('Device update: '+this._opts.id);
		
		this._opts.lastSeen = opts.lastSeen; //Update last discovery moment
		if ( JSON.stringify(this._opts.master) != JSON.stringify(opts.master) ) {
			this._debug(" - Device master changed to "+opts.master.host+":"+opts.master.port);
			this._opts.master = opts.master;
		}
		this._debug("My local address: "+this._opts.localAddress);
		if ( JSON.stringify({"host":this._opts.localAddress,"port":this._opts.localPort}) != JSON.stringify(opts.master) ) {
			if (this._opts.subscribed) {
				this._debug(" - Lost subscription, subscribing...");
				this.subscribe( (err, res) => {
					if ( err ) {
						console.log('Lost registration with device:',err);
					} else {
						console.log('Re-registered with device.');
					}
				});
			}
		}
		if ( JSON.stringify(this._opts.api) != JSON.stringify(opts.api) ) {
			this._debug(" - API changed");
			this._opts.api = opts.api;
			/* TODO: emit change notification? */
		}
		if (( this._opts.address != opts.address ) || ( this._opts.port != opts.port )) {
			this._debug(" - Network location changed ("+this._opts.address+ ":"+this._opts.port+" to "+opts.address+":"+opts.port+")");
			this._opts.address = opts.address;
			this._opts.port = opts.port;
			/* TODO: emit change notification? */
		}
		/* TODO: check subscribtion? */
	}
		
	_debug() {
		if( this._opts.debug ) {
			console.log.apply( null, arguments );
		}
	}
	
	executeRequest(path, body){
		return rp({
			method	: 'POST',
			uri		: 'http://' + this._opts.address+ ':' + this._opts.port + '/' + path,
			body	: body,
			headers	: {}
		}).then((result) => {
			try {
				body = JSON.parse(result);
				return Promise.resolve(body);
			} catch(e){
				return Promise.reject("json decode failed");
			}
		}).catch((err) => {
			return Promise.reject(err);
		});
	}
	
	query( endpoint, parameter ) {
		return this.executeRequest(endpoint, parameter)
			.then( (body) => {
				if ( ('error') in body ) return Promise.reject( body.error );
				if ( !('result') in body ) return Promise.reject( 'no result in response' );
				return Promise.resolve( body.result );
			})
			.catch( (err) => {
				return Promise.reject(err);
			});
	}
	
	setLocalAddress( addr ) {
		//console.log("ADRUINO LOCAL ADDRESS:",addr);
		this._opts.localAddress = addr;
	}
	
	subscribe() {
		return this.executeRequest("cfg/reg", this._opts.localAddress+":"+this._opts.localPort)
			.then( (body) => {
				if ( ('error') in body ) return Promise.reject( body.error );
				if ( !('result') in body ) return Promise.reject( 'no result in response' );
				if ( body.result == "ok") {
					this._opts.subscribed = true;
					return Promise.resolve(true);
				}
				return Promise.reject('unknown response');
			})
			.catch( (err) => {
				return Promise.reject(err);
			});
	}
	
	unsubscribe() {
		this._opts.subscribed = false;
	}
	
	setTriggerCb( callback ) {
		this._triggerCb = callback;
	}
	
	getOpt( key ) {
		return this._opts[ key ];
	}
	
	setOpt( key, value ) {
		this._opts[ key ] = value;
	}
}

module.exports = ArduinoDevice;
