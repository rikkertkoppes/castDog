var castDog = require('./castDog');
var config = require('./config.json');

var dog = castDog.start(config);



console.log(dog);

var express = require('express');
var bodyParser = require('body-parser');

var app = express();
app.use(express.static('public'));
app.use(bodyParser.json());

app.get('/hosts',function(req,res) {
    res.json(dog.getHosts());
});

app.get('/hosts/:name',function(req,res) {
    res.json(dog.getHost(req.params.name));
});

app.get('/hosts/:name/status',function(req,res) {
    dog.getStatus(req.params.name).then(function(status) {
        res.json(status);
    });
});

app.post('/hosts/:name/config',function(req,res) {
	console.log(req.body);
	var host = dog.getHost(req.params.name);
	if (host && host.pup) {
		if (host.pup.transportId) {
	    	host.pup.setConfig(req.body);
		} else {
			host.pup.initCastDeck(req.body);
		}
	    res.status(201);
	} else {
		res.status(404);
	}
});

var port = 6007;
app.listen(port);