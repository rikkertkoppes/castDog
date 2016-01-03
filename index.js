var castDog = require('./castDog');
var config = require('./config.json');

var dog = castDog.start(config);



console.log(dog);

var express = require('express');

var app = express();
app.use(express.static('public'));

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

var port = 6007;
app.listen(port);