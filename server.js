const cors = require('cors');
var express = require('express'),
app = express(),
port = process.env.PORT || 4000;
app.use(cors());
app.options('*', cors());
app.use(express.static(__dirname + '/benchmark-result'));
app.listen(port);