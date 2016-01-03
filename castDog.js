/* jshint node:true */
'use strict';

// TODO: check on startup if Bonjour is running and error out if not, not running bonjour results in an undefined error via mdns

// API helper docs
// https://github.com/thibauts/node-castv2/blob/master/README.md
var Client = require('castv2').Client;
var mdns = require('mdns');
var Promise = require('bluebird');

//using castDeck as a generic page displayer, see https://github.com/FirstLegoLeague/castDeck
var castDeckAppId = '4EC978AD';
var backDropAppId = 'E8C28D3C';

//the castDog instance, 
function Dog(config) {
    this.config = config;
    this.hosts = {};
}

function getRecord(host) {
    if (!host) {return null}
    return {
        id: host.txtRecord.id,
        name: host.name,
        fullname: host.fullname,
        host: host.host,
        port: host.port,
        address: host.addresses[0],
        pup: host.pup
    };
}

Dog.prototype.getHosts = function() {
    var hosts = this.hosts;
    return Object.keys(hosts).map(function(address) {
        return getRecord(hosts[address]);
    });
};

Dog.prototype.getStatus = function(name) {
    var host = this.getHost(name);
    if (!host.pup) {
        return Promise.resolve('no watcher initialized');
    } else {
        return host.pup.getStatus();
    }
}

Dog.prototype.getHost = function(name) {
    var hosts = this.hosts;
    return getRecord(Object.keys(hosts).map(function(address) {
        return hosts[address];
    }).filter(function(host) {
        return (host.name == name);
    })[0]);
};

Dog.prototype.createBrowser = function() {
    var self = this;
    this.browser = mdns.createBrowser(mdns.tcp('googlecast'));

    this.browser.on('serviceUp', function(service) {
        console.log('found device %s at %s:%d', service.name, service.addresses[0], service.port);
        self.hosts[service.addresses[0]] = service;
        console.log(self.hosts);
        var deviceConfig = self.config[service.name];
        // react if there is a configuration defined
        if (deviceConfig) {
            console.log('start service on ', service.name);
            self.ondeviceup(service.addresses[0], deviceConfig);
        }
    });

    this.browser.on('error', function(err) {
        console.log('browser',err);
    });

    process.on('error', function(err) {
        console.log('process',err);
    })

    // process.on('uncaughtException', function (er) {
    //     console.log('uncaught exception, restarting browser');
    //     console.error(er.stack)
    //     browser.stop();
    //     setTimeout(function() {
    //         start();
    //     },1000);
    // })

    this.browser.start();
    return this.browser;
};

//handler when a device is found, connect to it by creating a client
Dog.prototype.ondeviceup = function(host, deviceConfig) {
    var pup = new Pup();
    this.hosts[host].pup = pup;
    return pup.connect(host).then(function(pup) {
        pup.init(deviceConfig);
    });
};

//wrapper for the castv2 client
function Pup() {
    this.client = new Client();
    this.requests = 10;
}

Pup.prototype.connect = function(host) {
    var self = this;
    return new Promise(function(resolve,reject) {
        self.client.connect(host,function() {
            resolve(self);
        });
    });
}

Pup.prototype.init = function(deviceConfig) {
    var self = this;
    var client = this.client;
    this.deviceConfig = deviceConfig;
    //set up error listeners
    client.on('error', function(err) {
        console.log('client error',err);
    });

    client.on('close', function(err) {
        //terminate the client, since the next heartbeat errors
        console.log('client close',err);
        clearInterval(client.heartbeater);
    });

    //create a session
    var receiver = createReceiver(client);
    this.receiver = receiver;

    //watch the status and reinit if needed
    //TODO: debouncing or event listener cleanup
    //problem is that when the app is killed externally, the backdrop is launch event
    //is received twice. This occasionally leads to memleak warnings
    receiver.on('message', function(data, broadcast) {
        console.log(JSON.stringify(data));
        if (data.type === 'RECEIVER_STATUS') {
            if (isCasting(data.status, backDropAppId)) {
                console.log('backdrop detected!!!');
                self.initCastDeck();
            }
        }
    });
}

//initializes the castDeck application by launching the app and sending the device configuration
Pup.prototype.initCastDeck = function() {
    var client = this.client;
    var receiver = this.receiver;
    var deviceConfig = this.deviceConfig;
    return this.launchApplication(castDeckAppId).then(function(session) {
        console.log('got session');
        //send the configuration over
        sendMessage(session, 'urn:x-cast:org.firstlegoleague.castDeck', deviceConfig);
    });
}

//launches an application, resolves when application runs, rejects when it finds another running
Pup.prototype.launchApplication = function(appId) {
    var client = this.client;
    var receiver = this.receiver;
    return this.sendAndListen(receiver, {
        type: 'LAUNCH',
        appId: castDeckAppId,
        // requestId: 1
    },2000).then(function(data) {
        if (data.type === 'RECEIVER_STATUS' && data.status.applications) {
            console.log('app running, removing listener');
            if (isCasting(data.status), appId) {
                var transportId = data.status.applications[0].transportId

                return {
                    client: client,
                    appId: appId,
                    receiver: receiver,
                    transportId: transportId
                }
            } else {
                throw new Error('wrong application running: '+JSON.stringify(data));
            }
        }
    });

    // return new Promise(function(resolve,reject) {
    //     //launch the application
    //     receiver.send({
    //     });

    //     function checkApplicationRunning(data) {
    //     }

    //     //wait for the application to be running, resolve with a session
    //     receiver.addListener('message',checkApplicationRunning);
    // });
}

//sends a message and listens for a response with the same requestId
//timeouts after 500ms
Pup.prototype.sendAndListen = function(channel, data, timeout) {
    var self = this;
    return new Promise(function(resolve,reject) {
        var timer;
        data.requestId = self.requests++;//(+new Date());

        function handleMessage(response) {
            console.log('rec',response);
            if (response.requestId === data.requestId) {
                resolve(response);
                channel.removeListener('message', handleMessage);
                clearTimeout(timer);
            }
        }

        console.log('send',data);

        channel.on('message', handleMessage);
        channel.send(data);
        timer = setTimeout(function() {
            channel.removeListener('message',handleMessage);
            reject(new Error('no response after'+(timeout || 500)+'ms'));
        },timeout || 500);
    });
}

Pup.prototype.getStatus = function() {
    return this.sendAndListen(this.receiver,{
        type: 'GET_STATUS'
    }).then(function(response) {
        return response.status;
    });
}

Pup.prototype.toJSON = function() {
    console.log(this);
    return '';
    // return JSON.stringify(this.,['requestId','status','type']);
}


//starts the discovery service
function start(config) {
    var dog = new Dog(config);
    dog.createBrowser();

    return dog;
}

//create a receiver and requests the status (sync). Starts heartbeat
function createReceiver(client) {
    var connection = client.createChannel('sender-0', 'receiver-0', 'urn:x-cast:com.google.cast.tp.connection', 'JSON');
    var heartbeat = client.createChannel('sender-0', 'receiver-0', 'urn:x-cast:com.google.cast.tp.heartbeat', 'JSON');
    var receiver = client.createChannel('sender-0', 'receiver-0', 'urn:x-cast:com.google.cast.receiver', 'JSON');

    // establish virtual connection to the receiver
    connection.send({
        type: 'CONNECT'
    });

    //start heartbeating
    client.heartbeater = setInterval(function() {
        heartbeat.send({
            type: 'PING'
        });
    }, 5000);

    //ask for status
    receiver.send({type: 'GET_STATUS', requestId: 3});

    return receiver;
}



//sends a message to an established session (containing a transportId and client) (sync)
function sendMessage(session, namespace, message) {
    //create a channel
    var appConnectionChannel = session.client.createChannel('sender-0', session.transportId, 'urn:x-cast:com.google.cast.tp.connection', 'JSON');
    var appMessageChannel = session.client.createChannel('sender-0', session.transportId, namespace, 'JSON');
    //connect to the app
    appConnectionChannel.send({
        type: 'CONNECT'
    });

    //set up a listener to received messages
    // appMessageChannel.on('message', function(data, broadcast) {
    //     console.log('received message',data, broadcast);
    // });

    //send the message
    console.log('sending',message);
    appMessageChannel.send(message);
}



function isCasting(status, appId) {
    if (!status || !status.applications || status.applications.length === 0) {
        // not fully inited yet
        return false;
    }
    if (status.applications[0].appId === appId) {
        // currently showing backdrop
        return true;
    } else if (status.applications[0].statusText) {
        console.log(status.applications[0].displayName, status.applications[0].statusText)
    }
    return false;
}

module.exports = {
    start: start
};