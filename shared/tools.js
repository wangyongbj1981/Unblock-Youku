/*
 * Allow you smoothly surf on many websites blocking non-mainland visitors.
 * Copyright (C) 2012 - 2014  Bo Zhu  http://zhuzhu.org
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */


function new_random_ip() {
    "use strict";
    var ip_addr = '220.181.111.';
    //ip_addr += Math.floor(Math.random() * 255) + '.';
    ip_addr += Math.floor(Math.random() * 254 + 1); // 1 ~ 254
    return ip_addr;
}


function string_starts_with(str, substr) {
    "use strict";
    return str.slice(0, substr.length) === substr;
}


function _parse_url(url_str) {
    "use strict";
    var protocol = null;
    if (string_starts_with(url_str, 'http://')) {
        url_str = url_str.slice('http://'.length);
        protocol = 'http';
    } else if (string_starts_with(url_str, 'https://')) {
        url_str = url_str.slice('https://'.length);
        protocol = 'https';
    } else {
        console.error('URL does not start with http:// or https://');
        return null;
    }

    var path_idx = url_str.indexOf('/');
    if (path_idx < 0) {
        path_idx = url_str.length;
        url_str += '/';
    }
    var colon_idx = url_str.indexOf(':');  // the colon before the optional port number

    var sep_idx = path_idx;
    if (colon_idx >= 0 && colon_idx < path_idx) {
        sep_idx = colon_idx;
    }

    var urlobj = {
        protocol: protocol,
        // the parameter in FindProxyForURL only doesn't contain port numbers
        hostname: url_str.slice(0, sep_idx),
        portpath: url_str.slice(sep_idx)
    };

    return urlobj;
}
// console.log(parse_url('http://test.com'));
// console.log(parse_url('http://test.com:123));
// console.log(parse_url('http://test.com/path));
// console.log(parse_url('http://test.com:123/path));


function gen_url_map(protocol, white_ulist, proxy_ulist) {
    "use strict";
    var url_map = {
        white: {
            any: []
        },
        proxy: {
            any: []
        },
    };

    function add_patterns(map_obj, ulist) {
        var i, uobj, hostname, portpath;
        var key, val;
        for (i = 0; i < ulist.length; i++) {
            uobj = _parse_url(ulist[i]);
            if (uobj === null) {
                console.error('Invalid URL pattern: ' + ulist[i]);

            } else if (uobj.protocol === protocol) {
                hostname = uobj.hostname;
                portpath = uobj.portpath;
                if (hostname.indexOf('*') >= 0) {
                    if (hostname.slice(1).indexOf('*') >= 0) {  // * is only allowed to be the first char
                        console.error('Invalid wildcard URL pattern: ' + ulist[i]);
                        key = null;
                    } else {
                        key = 'any';
                        val = hostname + portpath;  // host:port/path
                    }
                } else {
                    if (typeof map_obj[hostname] === 'undefined') {
                        map_obj[hostname] = [];
                    }
                    key = hostname;
                    val = portpath;  // only :port/path
                }
                val = val.replace(/[\-\[\]\/\{\}\(\)\+\?\.\\\^\$\|]/g, '\\$&');
                val = val.replace(/\*/g, '.*');
                val = val.replace(/^\.\*/i, '[^\/]*');  // if starts with *; should not be possible for :port or /path
                val = '^' + val + '$';

                map_obj[key].push(val);
            }  // if
        }  // for
    }
    add_patterns(url_map.white, white_ulist);
    add_patterns(url_map.proxy, proxy_ulist);

    return JSON.stringify(url_map, null, "  ");
}


function urls2pac(url_whitelist, url_list, proxy_server) {
    "use strict";
    var http_map_str = gen_url_map('http', url_whitelist, url_list);
    var https_map_str = gen_url_map('https', url_whitelist, url_list);

    var txt = [
        "var _http_map = " + http_map_str + ";",
        "var _https_map = " + https_map_str + ";",
        "var _proxy_str = 'PROXY " + proxy_server + "';",
        "",
        "function _parse_url(url, host) {",
        "  var res_obj = {};",
        "  var idx = url.indexOf('://');",
        "  res_obj.protocol = url.slice(0, idx);",
        "  res_obj.portpath = url.slice(idx + 3 + host.length);",
        "  return res_obj;",
        "}",
        "",
        "function _check_regex_list(regex_list, str) {",
        "  var i;",
        "  for (i = 0; i < regex_list.length; i++)",
        "    if (new RegExp(regex_list[i], 'i').test(str))",  // better to convert to regex first
        "      return true;",
        "  return false;",
        "}",
        "",
        "function _check_patterns(patterns, hostname, portpath) {",
        "  if (typeof patterns[hostname] !== 'undefined')",
        "    if (_check_regex_list(patterns[hostname], portpath))",  // check only :port/path
        "      return true;",
        "  if (_check_regex_list(patterns.any, hostname + portpath))",  // check hostname:port/path
        "    return true;",
        "  return false;",
        "}",
        "",
        "function _find_proxy(url_map, host, port_path) {",
        "  if (_check_patterns(url_map.white, host, port_path))",
        "      return 'DIRECT';",
        "  if (_check_patterns(url_map.proxy, host, port_path))",
        "    return _proxy_str;",
        "  return 'DIRECT';",
        "}",
        "",
        "function FindProxyForURL(url, host) {",  // host doesn't contain port
        "  var url_obj = _parse_url(url, host);",
        "  var prot = url_obj.protocol;",
        "  if (prot === 'http')",
        "    return _find_proxy(_http_map, host, url_obj.portpath);",
        "  else if (prot === 'https')",
        "    return _find_proxy(_https_map, host, url_obj.portpath);",
        "  return 'DIRECT';",
        "}"
    ].join("\n") + "\n";

    console.log(txt);
    return txt;
}


// change host to Host, or user-agent to User-Agent
function to_title_case(str) {
    "use strict";
    // just a little differnt from http://goo.gl/IGhfR
    return str.replace(/\w[^\-\s]*/g, function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}


var exports = exports || {};
exports.new_random_ip = new_random_ip;
exports.urls2pac = urls2pac;
exports.string_starts_with = string_starts_with;
exports.to_title_case = to_title_case;
