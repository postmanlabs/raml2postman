var fs = require('fs');
var uuid = require('node-uuid');
var path = require('path');
var validator = require('postman_validator');
var raml = require('raml-parser');
var _ = require('lodash');
var Converter = require('./convert.js');

// var definition = [
//     '---',
//     'title: MyApi',
//     'baseUri: http://myapi.com',
//     '/:',
//     '  name: Root'
// ].join('\n');

// Converter.isValid(definition, function(val){
//     if(val){
//         console.log('valid');
//     }else{
//         console.log('invalid');
//     }
// });

// Converter.isValid('sample_files/github-api-v3.raml', function(val){
//     if(val){
//         console.log('valid');
//     }else{
//         console.log('invalid');
//     }
// });

// raml.loadFile('sample_files/github-api-v3.raml').then(function(data) {
//     fs.writeFileSync('./out.json', JSON.stringify(data, null, 4));
// }, function(error) {
//     console.error("Could not parse RAML file " + error);
// });