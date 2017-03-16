var regexp = /(\$\{(.+?)\})|$/g;

module.exports = function interpolate(obj, options) {
  options || (options = {});

  options.regexp || (options.regexp = regexp);
  options.filter || (options.filter = function (obj, key) { return obj.hasOwnProperty(key); });
  options.create || (options.create = Object.create);
  options.define || (options.define = Object.defineProperty);
  options.isArray || (options.isArray = Array.isArray || require('lodash').isArray);
  options.property || (options.property = require('lodash').property);

  return createRootEntry(obj, options);
};

function createRootEntry(value, options) {
  var props = {
    '--type--': {
      value: 'root'
    },
    '--source--': {
      value: value,
      writable: true
    },
    '--options--': {
      value: options,
      writable: true
    },
    '--items--': {
      value: {},
      writable: true
    }
  };

  var values = [];

  for (var key in value) {
    if (options.filter(value, key)) {
      (function (props, values, value, key) {
        props[key] = {
          enumerable: true,
          configurable: true,
          get: function () {
            return this['--items--'][key]['--value--'];
          },
          set: function (value) {
            this['--items--'][key] = createEntry(this, value);
          }
        };
        values.push([key, value[key]]);
      })(props, values, value, key);
    }
  }

  const entry = options.create(objectEntryPrototype, props);

  values.forEach(function (item, index) {
    entry[item[0]] = item[1];
  });

  return entry;
}

function createEntry(root, value) {
  var options = root['--options--'];

  if (value !== null && typeof (value) === 'object') {
    return options.isArray(value)
      ? createArrayEntry(root, value)
      : createObjectEntry(root, value);
  }
  return createValueEntry(root, value);
}

function createObjectEntry(root, value) {
  var options = root['--options--'];

  var props = {
    '--type--': {
      value: 'object'
    },
    '--source--': {
      value: value,
      writable: true
    },
    '--root--': {
      value: root,
      writable: true
    },
    '--value--': {
      get: function () {
        return this;
      }
    },
    '--items--': {
      value: {},
      writable: true
    }
  };

  var values = [];

  for (var key in value) {
    if (options.filter(value, key)) {
      (function (props, values, value, key) {
        props[key] = {
          enumerable: true,
          configurable: true,
          get: function () {
            return this['--items--'][key]['--value--'];
          },
          set: function (value) {
            this['--items--'][key] = createEntry(this['--root--'], value);
          }
        };
        values.push([key, value[key]]);
      })(props, values, value, key);
    }
  }

  const entry = options.create(objectEntryPrototype, props);

  values.forEach(function (item) {
    entry[item[0]] = item[1];
  });

  return entry;
}

var objectEntryPrototype = {
  toString: function () {
    return this['--items--'].toString();
  },
  toJSON: function () {
    var result = {};
    for (var key in this['--items--']) {
      if (this['--items--'].hasOwnProperty(key)) {
        result[key] = this['--items--'][key].toJSON();
      }
    }
    return result;
  }
};

function createArrayEntry(root, value) {
  var options = root['--options--'];

  var props = {
    '--type--': {
      value: 'array'
    },
    '--source--': {
      value: value,
      writable: true
    },
    '--root--': {
      value: root,
      writable: true
    },
    '--value--': {
      get: function () {
        return this;
      }
    },
    '--items--': {
      value: [],
      writable: true
    },
    length: {
      enumerable: true,
      get: function () {
        return this['--items--'].length;
      },
      set: function (value) {
        var i, length = this.length;
        if (value < length) {
          for (i = value; i < length; ++i) {
            delete this[i];
          }
          this['--items--'].length = value;
        }
        else if (value > length) {
          for (i = length; i < value; ++i) {
            createArrayEntryItemProp(this, i);
            this['--items--'].push(createValueEntry(this['--root--'], undefined));
          }
        }
      }
    }
  };

  var entry = options.create(arrayEntryPrototype, props);

  entry.push.apply(entry, value);

  return entry;
}

function createArrayEntryItemProp(entry, index) {
  var options = entry['--root--']['--options--'];

  options.define(
    entry, index, {
      enumerable: true,
      configurable: true,
      get: function () {
        return this['--items--'][index]['--value--'];
      },
      set: function (value) {
        this['--items--'][index] = createEntry(this['--root--'], value);
      }
    });
}

var arrayEntryPrototype = {
  toString: function () {
    return this['--items--'].toString();
  },
  toJSON: function () {
    return this['--items--'].map(
      function (item) {
        return item.toJSON();
      });
  },
  push: function () {
    var index = 0;
    var self = this;
    var entries = Array.prototype.map.call(
      arguments, function (item) {
        var entry = createEntry(self['--root--'], item);
        createArrayEntryItemProp(self, index++);
        return entry;
      });
    return this['--items--'].push.apply(this['--items--'], entries);
  },
  unshift: function () {
    var length = this.length;
    var entries = Array.prototype.map.call(
      arguments, function (item, index) {
        var entry = createEntry(this['--root--'], item);
        createArrayEntryItemProp(this, length++);
        return entry;
      });
    return this['--items--'].unshift.apply(this['--items--'], entries);
  }
};

function createValueEntry(root, value) {
  if (typeof (value) === 'string') {
    return createStringEntry(root, value);
  }

  var options = root['--options--'];

  var props = {
    '--type--': {
      value: 'value'
    },
    '--source--': {
      value: value,
      writable: true
    },
    '--root--': {
      value: root,
      writable: true
    },
    '--value--': {
      get: function () {
        return this['--source--'];
      }
    }
  };

  return options.create(valueEntryPrototype, props);
}

var valueEntryPrototype = {
  toString: function () {
    return this['--value--'];
  },
  toJSON: function () {
    return this['--value--'];
  }
};

function createStringEntry(root, value) {
  var options = root['--options--'];

  var parts = [], index = 0;
  value.replace(options.regexp, function (match, skip, key, offset, str) {
    if (offset !== index) {
      var sub = str.substring(index, offset);
      parts.push(function () { return sub; });
    }
    key && parts.push(options.property(key));
    index = offset + match.length;
  });

  var props = {
    '--type--': {
      value: 'string'
    },
    '--source--': {
      value: value,
      writable: true
    },
    '--root--': {
      value: root,
      writable: true
    },
    '--value--': {
      get: function () {
        var self = this;
        return this['--items--']
          .map(
            function (x) {
              return x(self['--root--']);
            })
          .join('');
      }
    },
    '--items--': {
      value: parts,
      writable: true
    }
  };

  return options.create(valueEntryPrototype, props);
}
