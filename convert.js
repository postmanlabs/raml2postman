var fs = require('fs');
var uuid = require('node-uuid');
var path = require('path');
var validator = require('postman_validator');
var raml = require('raml-parser');
var _ = require('lodash');
var async = require('async');

var converter = {

    sampleFile: {},
    currentFolder: {},
    env: {},

    parseString: function(ramlString, callback, callbackError) {
        var oldThis = this;
        raml.load(ramlString).then(function(data) {
            try {
                oldThis.convert(data);

                // Validate before invoking callback;
                if (oldThis.validate()) {
                    var sf = oldThis.sampleFile;
                    var env = _.clone(sf.environment, true);

                    delete sf.environment;

                    callback(sf, env);
                } else {
                    callback({}, {});
                }

            } catch (err) {
                console.log(err);
                process.exit(1);
            }
        }, function(error) {
            callbackError(((error.message) ? error.message : error));
        });
    },

    parseFile: function(filename, callback) {
        var oldThis = this;
        raml.loadFile(filename).then(function(data) {
            try {
                oldThis.convert(data);

                // Validate before invoking callback;
                if (oldThis.validate()) {
                    var sf = oldThis.sampleFile;
                    var env = _.clone(sf.environment, true);

                    delete sf.environment;

                    callback(sf, env);
                } else {
                    callback({}, {});
                }

            } catch (err) {
                console.log(err);
                process.exit(1);
            }
        }, function(error) {
            console.error("Could not parse RAML file " + error);
        });
    },

    convertResource: function(res, parentUri) {
        var oldThis = this;
        var baseUri = parentUri;

        var paramDescription = 'Parameters:\n\n';

        //using bind for pass this context parameter as
        //lodash 4+ does not support this
        //check https://github.com/lodash/lodash/wiki/Changelog#v400
        _.forOwn(res.uriParameters, _.bind(function(val, urlParam) {
            res.relativeUri = res.relativeUri.replace('{' + urlParam + '}', ":" + urlParam);
            this.addEnvKey(urlParam, val.type, val.displayName);

            val.description = val.description || "";
            paramDescription += urlParam + ": " + val.description + '\n\n';

        }, this));

        // Override the parentUri params, if they are specified here additionally.
        // Only new params affect this part. Old params have been converted already.

        _.forOwn(res.baseUriParameters, _.bind(function(val, urlParam) {
            baseUri = baseUri.replace('{' + urlParam + '}', ":" + urlParam);
            this.addEnvKey(urlParam, val.type, val.displayName);
        }, this));

        // All occurences of baseUriParams have been dealt earlier.
        var resourceUri = baseUri + res.relativeUri;

        if (this.currentFolder.id === this.sampleFile.id) {

            // Top level resource, create another folder, pass the new folder id to the children.
            var folder = {};
            folder.id = this.generateId();
            folder.name = res.relativeUri;
            folder.description = "";
            folder.order = [];
            folder.collection_name = this.sampleFile.name;
            folder.collection_id = this.sampleFile.id;

            // All subResources will access the order array from this obj
            // and push their request id's into it.
            this.currentFolder = folder;
        }

        // Convert own methods.
        _.forEach(res.methods, _.bind(function(req) {

            // Make a deep copy of the the sampleRequest.
            var request = _.clone(this.sampleRequest, true);
            request.collectionId = this.sampleFile.id;

            var headerString = '';
            var queryFlag = false;

            request.description = req.description || "";
            request.description += '\n\n' + paramDescription;

            // // Description can be formatted using Markdown, we don't want lengthy descriptions.
            // if (req.description) {

            //     var len = req.description.length > 2000 ? 2000 : req.description.length;
            //     request.description = req.description.substring(0, len);

            //     if (len > 2000) {
            //         request.description += '...';
            //     }
            // }

            request.id = this.generateId();
            request.method = req.method;

            // No name has been specified, use the complete Uri minus the Base Uri.
            request.name = resourceUri.replace(this.data.baseUri, '');

            request.time = this.generateTimestamp();
            request.url = resourceUri;

            // Headers
            _.forOwn(req.headers, function(val, header) {
                headerString += header + ": \n";
            });

            // Query Parameters.
            _.forOwn(req.queryParameters, function(val, param) {
                if (!queryFlag) {
                    request.url += '?';
                } else {
                    request.url += '&';
                }
                request.url += param + '=';
                queryFlag = queryFlag || true;
            });

            // Body
            _.forOwn(req.body, _.bind(function(val, bodyParam) {

                if (bodyParam === 'application/x-www-form-urlencoded') {
                    request.dataMode = 'urlencoded';
                } else if (bodyParam === 'multipart/form-data') {
                    request.dataMode = 'params';
                } else {
                    request.dataMode = 'raw';

                    // add a Content-Type header.
                    headerString += 'Content-Type: ' + bodyParam + '\n';

                    if (val) {
                        request.rawModeData = val.example || "";
                    }

                    // Deal with schemas later, show example for now.
                    // // Only JSON schemas can be parsed. Schema has to be specified.
                    // if (bodyParam === 'application/json' && val.schema) {
                    //     request.rawModeData = JSON.stringify(this.schemaToJSON(JSON.parse(val.schema)));
                    // } else {
                    //     // If schema isn't present or if the data type is not json
                    //     request.rawModeData = val.example || "";
                    // }
                }

                // Haven't found a way to upload files in the raml spec.
                if (request.dataMode === 'urlencoded' || req.dataMode === 'multipart/form-data') {
                    _.forOwn(val.formParameters, function(value, param) {
                        var obj = {};
                        obj[param] = '';
                        request.data.push(obj);
                    });
                }
            }, this));

            request.headers = headerString;
            this.sampleFile.requests.push(request);
            this.currentFolder.order.push(request.id);
        }, this));

        // Convert child resources.
        _.forEach(res.resources, _.bind(function(subRes) {
            this.convertResource(subRes, resourceUri);
        }, this));

        // Check if the current resource is a top level resource.
        if (parentUri === this.data.baseUri) {

            // If there is only 1 request in the current folder, why create a folder?
            if (this.currentFolder.order.length > 1) {

                // All the requests in the top level resource have been processed.
                this.sampleFile.folders.push(this.currentFolder);
            } else {

                // Add the request to the order property.
                this.sampleFile.order.push(this.currentFolder.order[0]);
            }

            // Reset the currentFolder to the collection id.
            this.currentFolder = {
                id: oldThis.sampleFile.id
            };
        }
    },

    read: function(location) {
        var data;
        try {
            data = fs.readFileSync(location, 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            console.log(err);
            process.exit(1);
        }
    },

    schemaToJSON: function(schema) {
        var obj;
        var oldThis = this;
        switch (schema.type) {
            case 'object':
                obj = {};

                // For each property, repeat the same thing
                _.forOwn(schema.properties, function(val, item) {
                    obj[item] = this.schemaToJSON(val);
                }, this);

                break;
            case 'array':
                obj = [];

                // return the populated array
                if (schema.items) {
                    schema.items.forEach(function(value) {
                        obj.push(oldThis.schemaToJSON(value));
                    });
                }

                break;
            case 'boolean':
            case 'integer':
            case 'number':
            case 'string':
                obj = "";
                break;
        }
        return obj;
    },

    _modifyTraits: function() {
        // Make the traits property more accessible.
        this.data.traits = _.reduce(this.data.traits, function(acc, trait) {
            _.forOwn(trait, function(val, key) {
                acc[key] = val;
            });

            return acc;
        }, {});
    },

    _modifySchemas: function() {
        this.data.schemas = _.reduce(this.data.schemas, function(acc, schema) {
            _.forOwn(schema, function(val, key) {
                acc[key] = val;
            });

            return acc;
        }, {});
    },

    _modifyResourceTypes: function() {
        this.data.resourceTypes = _.reduce(this.data.resourceTypes, function(acc, resourceType) {
            _.forOwn(resourceType, function(val, key) {
                acc[key] = val;
            });

            return acc;
        }, {});
    },

    addEnvKey: function(key, type, displayName) {
        if (!_.has(this.env, key)) {
            var envObj = {};
            envObj.name = displayName || key;
            envObj.enabled = true;
            envObj.value = "";
            envObj.type = type || "string";
            envObj.key = key;

            this.env[key] = envObj;
        }
    },

    convert: function(data) {

        this.data = data;

        // Modify the data to make it an indexed collection.
        this._modifyTraits();
        this._modifySchemas();
        this._modifyResourceTypes();

        // Initialize the spec.
        //var file = './postman-boilerplate.json';
        this.sampleFile = JSON.parse('{"environment":{"values":[],"name":"","id":"","timestamp":0},"folders":[{"id":"","name":"","description":"","order":[],"collection_name":"","collection_id":""}],"id":"","name":"New Collection","order":[],"requests":[{"collectionId":"","dataMode":"params","descriptionFormat":"html","description":"","data":[],"headers":"","id":"","method":"","name":"","preRequestScript":"","pathVariables":{},"responses":[],"synced":false,"tests":"","time":0,"url":""}],"synced":false,"timestamp":0}');

        var sf = this.sampleFile;

        // Collection trivia
        sf.id = this.generateId();
        sf.timestamp = this.generateTimestamp();

        // Cache sampleRequest
        this.sampleRequest = sf.requests[0];
        sf.requests = [];

        sf.name = data.title || "";

        // Temporary, will be populated later.
        sf.folders = [];

        sf.environment.name = (sf.name || "Default") + "'s Environment";
        sf.environment.timestamp = this.generateTimestamp();
        sf.environment.id = this.generateId();

        // BaseURI Conversion
        _.forOwn(this.data.baseUriParameters, _.bind(function(val, param) {
            // Version will be specified in the baseUriParameters
            this.data.baseUri = this.data.baseUri.replace("{" + param + "}", ":" + param);

            this.addEnvKey(param, val.type, val.displayName);
        }, this));

        // Convert schemas to objects.
        // Will be parsed later.
        var sc = this.data.schemas;

        // _.forOwn(sc, function(val, schema) {
        //     val = this.schemaToJSON(JSON.parse(val));
        // }, this);

        _.forEach(this.data.resources, _.bind(function(resource) {
            // Initialize the currentFolder
            this.currentFolder.id = sf.id;

            // Top Level conversion.
            this.convertResource(resource, this.data.baseUri);
        }, this));

        //Add the environment variables.
        _.forOwn(this.env, function(val) {
            sf.environment.values.push(val);
        }, this);

        if (!this.group) {

            // Copy over the ids in the order field of each folder
            // to the global order field

            _.forEach(sf.folders, function(folder) {
                _.forEach(folder.order, function(ord) {
                    sf.order.push(ord);
                }, this);
            }, this);

            // If grouping is disabled, reset the folders.
            sf.folders = [];
        }
    },

    _convert: function(inputFile, options, cb) {
        var file = path.resolve(__dirname, inputFile);

        this.group = options.group;

        // Set to true to generate test file.
        this.test = options.test;

        this.parseFile(file, cb);
    },

    generateId: function() {
        if (this.test) {
            return "";
        } else {
            return uuid.v4();
        }
    },

    generateTimestamp: function() {
        if (this.test) {
            return 0;
        } else {
            return Date.now();
        }
    },

    validate: function() {

        if (validator.validateJSON('c', this.sampleFile).status) {
            console.log('The conversion was successful');
            return true;
        } else {
            console.log("Could not validate generated file");
            return false;
        }
    },

    // Callback will be invoked with a boolean value indicating the validity.
    isValid: function(str, callback) {

        var later = function() {
            callback(true);
        };

        var error = function() {
            callback(false);
        }

        // Title is a required property.
        if (str.indexOf('title:') > 0) {
            raml.load(str).then(later, error);
        } else {
            raml.loadFile(str).then(later, error);
        }
    }
};

module.exports = converter;