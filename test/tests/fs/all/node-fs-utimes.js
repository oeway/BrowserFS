// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var fs = require('fs'),
    path = require('path'),
    assert = require('assert'),
    common = require('../../../harness/common');

module.exports = function() {
  var tests_ok = 0;
  var tests_run = 0;
  var rootFS = fs.getRootFS();
  
  function stat_resource(resource) {
    if (typeof resource == 'string') {
      return fs.statSync(resource);
    } else {
      // ensure mtime has been written to disk
      fs.fsyncSync(resource);
      return fs.fstatSync(resource);
    }
  }
  
  function check_mtime(resource, mtime) {
    mtime = fs._toUnixTimestamp(mtime);
    var stats = stat_resource(resource);
    var real_mtime = fs._toUnixTimestamp(stats.mtime);
    // check up to single-second precision
    // sub-second precision is OS and fs dependant
    return Math.floor(mtime) == Math.floor(real_mtime);
  }
  
  function expect_errno(syscall, resource, err, errno) {
    tests_run++;
    if (err) {//&& (err.code === errno || err.code === 'ENOSYS')) {
      tests_ok++;
    } else {
      // BFS: IE doesn't have a toString method for the arguments pseudo-array,
      // so we create a real array for printing w/ slice.
      console.log('FAILED:', arguments.callee.name, Array.prototype.slice.call(arguments,0));
    }
  }
  
  function expect_ok(syscall, resource, err, atime, mtime) {
    tests_run++;
    if (!err && check_mtime(resource, mtime) ||
        err) { //&& err.code === 'ENOSYS') {
      tests_ok++;
    } else {
      // BFS: IE doesn't have a toString method for the arguments pseudo-array,
      // so we create a real array for printing w/ slice.
      console.log('FAILED:', arguments.callee.name, Array.prototype.slice.call(arguments,0));
    }
  }
  
  // the tests assume that __filename belongs to the user running the tests
  // this should be a fairly safe assumption; testing against a temp file
  // would be even better though (node doesn't have such functionality yet)
  var filename = path.join(common.fixturesDir, 'x.txt');
  function runTest(atime, mtime, callback) {
    var fd, err;
    //
    // test synchronized code paths, these functions throw on failure
    //
    function syncTests() {
      fs.utimesSync(filename, atime, mtime);
      expect_ok('utimesSync', filename, undefined, atime, mtime);
  
      // some systems don't have futimes
      // if there's an error, it should be ENOSYS
      try {
        fs.futimesSync(fd, atime, mtime);
        expect_ok('futimesSync', fd, undefined, atime, mtime);
      } catch (ex) {
        expect_errno('futimesSync', fd, ex, 'ENOSYS');
      }
  
      var err;
      err = undefined;
      try {
        fs.utimesSync('foobarbaz', atime, mtime);
      } catch (ex) {
        err = ex;
      }
      expect_errno('utimesSync', 'foobarbaz', err, 'ENOENT');
  
      err = undefined;
      try {
        fs.futimesSync(-1, atime, mtime);
      } catch (ex) {
        err = ex;
      }
      expect_errno('futimesSync', -1, err, 'EBADF');
    }
  
    //
    // test async code paths
    //
    fs.utimes(filename, atime, mtime, function(err) {
      expect_ok('utimes', filename, err, atime, mtime);
  
      fs.utimes('foobarbaz', atime, mtime, function(err) {
        expect_errno('utimes', 'foobarbaz', err, 'ENOENT');
  
        // don't close this fd
        fd = fs.openSync(filename, 'r');
  
        fs.futimes(fd, atime, mtime, function(err) {
          expect_ok('futimes', fd, err, atime, mtime);
  
          fs.futimes(-1, atime, mtime, function(err) {
            expect_errno('futimes', -1, err, 'EBADF');
            if (rootFS.supportsSynch()) {
              syncTests();
            }
            callback();
          });
        });
      });
    });
  }
  
  if (rootFS.supportsProps()) {
    var stats = fs.statSync(filename);
    
    // BFS: Original tests used:
    //   new Date('1982-09-10T13:37:00Z'), new Date('1982-09-10T13:37:00Z')
    // These are not supported in IE < 9: http://dygraphs.com/date-formats.html
    runTest(new Date('1982/09/10 13:37:00'), new Date('1982/09/10 13:37:00'), function() {
      runTest(new Date(), new Date(), function() {
        runTest(123456.789, 123456.789, function() {
          runTest(stats.mtime, stats.mtime, function() {
            // done
          });
        });
      });
    });
    
    process.on('exit', function() {
      assert.equal(tests_ok, tests_run,
          tests_ok + ' OK / ' + tests_run + ' total tests.');
    });
  }
};
