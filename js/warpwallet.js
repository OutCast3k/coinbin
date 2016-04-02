(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.warpwallet = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('isarray')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
  ? global.TYPED_ARRAY_SUPPORT
  : typedArraySupport()

function typedArraySupport () {
  try {
    var arr = new Uint8Array(1)
    arr.foo = function () { return 42 }
    return arr.foo() === 42 && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        arr.subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
}

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */
function Buffer (arg) {
  if (!(this instanceof Buffer)) {
    // Avoid going through an ArgumentsAdaptorTrampoline in the common case.
    if (arguments.length > 1) return new Buffer(arg, arguments[1])
    return new Buffer(arg)
  }

  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    this.length = 0
    this.parent = undefined
  }

  // Common case.
  if (typeof arg === 'number') {
    return fromNumber(this, arg)
  }

  // Slightly less common case.
  if (typeof arg === 'string') {
    return fromString(this, arg, arguments.length > 1 ? arguments[1] : 'utf8')
  }

  // Unusual.
  return fromObject(this, arg)
}

// TODO: Legacy, not needed anymore. Remove in next major version.
Buffer._augment = function (arr) {
  arr.__proto__ = Buffer.prototype
  return arr
}

function fromNumber (that, length) {
  that = allocate(that, length < 0 ? 0 : checked(length) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < length; i++) {
      that[i] = 0
    }
  }
  return that
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') encoding = 'utf8'

  // Assumption: byteLength() return value is always < kMaxLength.
  var length = byteLength(string, encoding) | 0
  that = allocate(that, length)

  that.write(string, encoding)
  return that
}

function fromObject (that, object) {
  if (Buffer.isBuffer(object)) return fromBuffer(that, object)

  if (isArray(object)) return fromArray(that, object)

  if (object == null) {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (typeof ArrayBuffer !== 'undefined') {
    if (object.buffer instanceof ArrayBuffer) {
      return fromTypedArray(that, object)
    }
    if (object instanceof ArrayBuffer) {
      return fromArrayBuffer(that, object)
    }
  }

  if (object.length) return fromArrayLike(that, object)

  return fromJsonObject(that, object)
}

function fromBuffer (that, buffer) {
  var length = checked(buffer.length) | 0
  that = allocate(that, length)
  buffer.copy(that, 0, 0, length)
  return that
}

function fromArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Duplicate of fromArray() to keep fromArray() monomorphic.
function fromTypedArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  // Truncating the elements is probably not what people expect from typed
  // arrays with BYTES_PER_ELEMENT > 1 but it's compatible with the behavior
  // of the old Buffer constructor.
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayBuffer (that, array) {
  array.byteLength // this throws if `array` is not a valid ArrayBuffer

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(array)
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromTypedArray(that, new Uint8Array(array))
  }
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Deserialize { type: 'Buffer', data: [1,2,3,...] } into a Buffer object.
// Returns a zero-length buffer for inputs that don't conform to the spec.
function fromJsonObject (that, object) {
  var array
  var length = 0

  if (object.type === 'Buffer' && isArray(object.data)) {
    array = object.data
    length = checked(array.length) | 0
  }
  that = allocate(that, length)

  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype
  Buffer.__proto__ = Uint8Array
} else {
  // pre-set for values that may exist in the future
  Buffer.prototype.length = undefined
  Buffer.prototype.parent = undefined
}

function allocate (that, length) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(length)
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that.length = length
  }

  var fromPool = length !== 0 && length <= Buffer.poolSize >>> 1
  if (fromPool) that.parent = rootParent

  return that
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  var i = 0
  var len = Math.min(x, y)
  while (i < len) {
    if (a[i] !== b[i]) break

    ++i
  }

  if (i !== len) {
    x = a[i]
    y = b[i]
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

  if (list.length === 0) {
    return new Buffer(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buf = new Buffer(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

function byteLength (string, encoding) {
  if (typeof string !== 'string') string = '' + string

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'binary':
      // Deprecated
      case 'raw':
      case 'raws':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  start = start | 0
  end = end === undefined || end === Infinity ? this.length : end | 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
// Buffer instances.
Buffer.prototype._isBuffer = true

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    var swap = encoding
    encoding = offset
    offset = length | 0
    length = swap
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = this.subarray(start, end)
    newBuf.__proto__ = Buffer.prototype
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = (value & 0xff)
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; i--) {
      target[i + targetStart] = this[i + start]
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    )
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"base64-js":2,"ieee754":3,"isarray":4}],2:[function(require,module,exports){
;(function (exports) {
  'use strict'

  var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

  var PLUS = '+'.charCodeAt(0)
  var SLASH = '/'.charCodeAt(0)
  var NUMBER = '0'.charCodeAt(0)
  var LOWER = 'a'.charCodeAt(0)
  var UPPER = 'A'.charCodeAt(0)
  var PLUS_URL_SAFE = '-'.charCodeAt(0)
  var SLASH_URL_SAFE = '_'.charCodeAt(0)

  function decode (elt) {
    var code = elt.charCodeAt(0)
    if (code === PLUS || code === PLUS_URL_SAFE) return 62 // '+'
    if (code === SLASH || code === SLASH_URL_SAFE) return 63 // '/'
    if (code < NUMBER) return -1 // no match
    if (code < NUMBER + 10) return code - NUMBER + 26 + 26
    if (code < UPPER + 26) return code - UPPER
    if (code < LOWER + 26) return code - LOWER + 26
  }

  function b64ToByteArray (b64) {
    var i, j, l, tmp, placeHolders, arr

    if (b64.length % 4 > 0) {
      throw new Error('Invalid string. Length must be a multiple of 4')
    }

    // the number of equal signs (place holders)
    // if there are two placeholders, than the two characters before it
    // represent one byte
    // if there is only one, then the three characters before it represent 2 bytes
    // this is just a cheap hack to not do indexOf twice
    var len = b64.length
    placeHolders = b64.charAt(len - 2) === '=' ? 2 : b64.charAt(len - 1) === '=' ? 1 : 0

    // base64 is 4/3 + up to two characters of the original data
    arr = new Arr(b64.length * 3 / 4 - placeHolders)

    // if there are placeholders, only get up to the last complete 4 chars
    l = placeHolders > 0 ? b64.length - 4 : b64.length

    var L = 0

    function push (v) {
      arr[L++] = v
    }

    for (i = 0, j = 0; i < l; i += 4, j += 3) {
      tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
      push((tmp & 0xFF0000) >> 16)
      push((tmp & 0xFF00) >> 8)
      push(tmp & 0xFF)
    }

    if (placeHolders === 2) {
      tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
      push(tmp & 0xFF)
    } else if (placeHolders === 1) {
      tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
      push((tmp >> 8) & 0xFF)
      push(tmp & 0xFF)
    }

    return arr
  }

  function uint8ToBase64 (uint8) {
    var i
    var extraBytes = uint8.length % 3 // if we have 1 byte left, pad 2 bytes
    var output = ''
    var temp, length

    function encode (num) {
      return lookup.charAt(num)
    }

    function tripletToBase64 (num) {
      return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
    }

    // go through the array every three bytes, we'll deal with trailing stuff later
    for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
      temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
      output += tripletToBase64(temp)
    }

    // pad the end with zeros, but make sure to not forget the extra bytes
    switch (extraBytes) {
      case 1:
        temp = uint8[uint8.length - 1]
        output += encode(temp >> 2)
        output += encode((temp << 4) & 0x3F)
        output += '=='
        break
      case 2:
        temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
        output += encode(temp >> 10)
        output += encode((temp >> 4) & 0x3F)
        output += encode((temp << 2) & 0x3F)
        output += '='
        break
      default:
        break
    }

    return output
  }

  exports.toByteArray = b64ToByteArray
  exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],3:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],4:[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

},{}],5:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],6:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],7:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],8:[function(require,module,exports){
(function (process,global){
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

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":7,"_process":6,"inherits":5}],9:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.7.1-g
(function() {
  exports.transform = function(x, options) {
    return x.icedTransform(options);
  };

  exports.runtime = require('iced-runtime');

}).call(this);

},{"iced-runtime":13}],10:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.7.1-c
(function() {
  var BaseError, Canceler, EscErr, EscOk, c_to_camel, ipush, make_error_klass, make_errors, make_esc, to_lower, util,
    __slice = [].slice;

  util = require('util');

  exports.BaseError = BaseError = function(msg, constructor) {
    Error.captureStackTrace(this, this.constructor);
    return this.message = msg || 'Error';
  };

  util.inherits(BaseError, Error);

  BaseError.prototype.name = "BaseError";

  to_lower = function(s) {
    return s[0].toUpperCase() + s.slice(1).toLowerCase();
  };

  c_to_camel = function(s) {
    var p;
    return ((function() {
      var _i, _len, _ref, _results;
      _ref = s.split(/_/);
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        p = _ref[_i];
        _results.push(to_lower(p));
      }
      return _results;
    })()).join('');
  };

  make_error_klass = function(k, code, default_msg) {
    var ctor;
    ctor = function(msg) {
      BaseError.call(this, msg || default_msg, this.constructor);
      this.istack = [];
      this.code = code;
      return this;
    };
    util.inherits(ctor, BaseError);
    ctor.prototype.name = k;
    ctor.prototype.inspect = function() {
      return "[" + k + ": " + this.message + " (code " + this.code + ")]";
    };
    return ctor;
  };

  exports.make_errors = make_errors = function(d) {
    var enam, errno, k, msg, out, val;
    out = {
      msg: {},
      name: {},
      code: {}
    };
    d.OK = "Success";
    errno = 100;
    for (k in d) {
      msg = d[k];
      if (k !== "OK") {
        enam = (c_to_camel(k)) + "Error";
        val = errno++;
        out[enam] = make_error_klass(enam, val, msg);
      } else {
        val = 0;
      }
      out[k] = val;
      out.msg[k] = out.msg[val] = msg;
      out.name[k] = out.name[val] = k;
      out.code[k] = val;
    }
    return out;
  };

  ipush = function(e, msg) {
    if (msg != null) {
      if (e.istack == null) {
        e.istack = [];
      }
      return e.istack.push(msg);
    }
  };

  exports.make_esc = make_esc = function(gcb, where) {
    return function(lcb) {
      return function() {
        var args, err;
        err = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
        if (err == null) {
          return lcb.apply(null, args);
        } else if (!gcb.__esc) {
          gcb.__esc = true;
          ipush(err, where);
          return gcb(err);
        }
      };
    };
  };

  exports.EscOk = EscOk = (function() {
    function EscOk(gcb, where) {
      this.gcb = gcb;
      this.where = where;
    }

    EscOk.prototype.bailout = function() {
      var t;
      if (this.gcb) {
        t = this.gcb;
        this.gcb = null;
        return t(false);
      }
    };

    EscOk.prototype.check_ok = function(cb) {
      return (function(_this) {
        return function() {
          var args, ok;
          ok = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
          if (!ok) {
            return _this.bailout();
          } else {
            return cb.apply(null, args);
          }
        };
      })(this);
    };

    EscOk.prototype.check_err = function(cb) {
      return (function(_this) {
        return function() {
          var args, err;
          err = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
          if (err != null) {
            ipush(err, _this.where);
            return _this.bailout();
          } else {
            return cb.apply(null, args);
          }
        };
      })(this);
    };

    EscOk.prototype.check_non_null = function(cb) {
      return (function(_this) {
        return function() {
          var args;
          args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
          if (args[0] == null) {
            return _this.bailout();
          } else {
            return cb.apply(null, args);
          }
        };
      })(this);
    };

    return EscOk;

  })();

  exports.EscErr = EscErr = (function() {
    function EscErr(gcb, where) {
      this.gcb = gcb;
      this.where = where;
    }

    EscErr.prototype.finish = function(err) {
      var t;
      if (this.gcb) {
        t = this.gcb;
        this.gcb = null;
        return t(err);
      }
    };

    EscErr.prototype.check_ok = function(cb, eclass, emsg) {
      if (eclass == null) {
        eclass = Error;
      }
      if (emsg == null) {
        emsg = null;
      }
      return function() {
        var args, err, ok;
        ok = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
        if (!ok) {
          err = new eclass(emsg);
          ipush(err, this.where);
          return this.finish(err);
        } else {
          return cb.apply(null, args);
        }
      };
    };

    EscErr.prototype.check_err = function(cb) {
      return function() {
        var args, err;
        err = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
        if (err != null) {
          ipush(err, this.where);
          return this.finish(err);
        } else {
          return cb.apply(null, args);
        }
      };
    };

    return EscErr;

  })();

  exports.Canceler = Canceler = (function() {
    function Canceler(klass) {
      this.klass = klass != null ? klass : Error;
      this._canceled = false;
    }

    Canceler.prototype.is_canceled = function() {
      return this._canceled;
    };

    Canceler.prototype.is_ok = function() {
      return !this._canceled;
    };

    Canceler.prototype.cancel = function() {
      return this._canceled = true;
    };

    Canceler.prototype.err = function() {
      if (this._canceled) {
        return new this.klass("Aborted");
      } else {
        return null;
      }
    };

    return Canceler;

  })();

  exports.chain = function(cb, f) {
    return function() {
      var args;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      return f(function() {
        return cb.apply(null, args);
      });
    };
  };

  exports.chain_err = function(cb, f) {
    return function() {
      var args0;
      args0 = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      return f(function() {
        var args1;
        args1 = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        return cb.apply(null, ((args1[0] != null) && !(args0[0] != null) ? args1 : args0));
      });
    };
  };

}).call(this);



},{"util":8}],11:[function(require,module,exports){
// Generated by IcedCoffeeScript 108.0.8
(function() {
  module.exports = {
    k: "__iced_k",
    k_noop: "__iced_k_noop",
    param: "__iced_p_",
    ns: "iced",
    runtime: "runtime",
    Deferrals: "Deferrals",
    deferrals: "__iced_deferrals",
    fulfill: "_fulfill",
    b_while: "_break",
    t_while: "_while",
    c_while: "_continue",
    n_while: "_next",
    n_arg: "__iced_next_arg",
    defer_method: "defer",
    slot: "__slot",
    assign_fn: "assign_fn",
    autocb: "autocb",
    retslot: "ret",
    trace: "__iced_trace",
    passed_deferral: "__iced_passed_deferral",
    findDeferral: "findDeferral",
    lineno: "lineno",
    parent: "parent",
    filename: "filename",
    funcname: "funcname",
    catchExceptions: 'catchExceptions',
    runtime_modes: ["node", "inline", "window", "none", "browserify", "interp"],
    trampoline: "trampoline",
    context: "context",
    defer_arg: "__iced_defer_"
  };

}).call(this);

},{}],12:[function(require,module,exports){
// Generated by IcedCoffeeScript 108.0.8
(function() {
  var C, Pipeliner, iced, __iced_k, __iced_k_noop, _iand, _ior, _timeout,
    __slice = [].slice;

  __iced_k = __iced_k_noop = function() {};

  C = require('./const');

  exports.iced = iced = require('./runtime');

  _timeout = function(cb, t, res, tmp) {
    var arr, rv, which, ___iced_passed_deferral, __iced_deferrals, __iced_k;
    __iced_k = __iced_k_noop;
    ___iced_passed_deferral = iced.findDeferral(arguments);
    rv = new iced.Rendezvous;
    tmp[0] = rv.id(true).defer({
      assign_fn: (function(_this) {
        return function() {
          return function() {
            return arr = __slice.call(arguments, 0);
          };
        };
      })(this)(),
      lineno: 20,
      context: __iced_deferrals
    });
    setTimeout(rv.id(false).defer({
      lineno: 21,
      context: __iced_deferrals
    }), t);
    (function(_this) {
      return (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral,
          filename: "/Users/max/src/iced/iced-runtime/src/library.iced"
        });
        rv.wait(__iced_deferrals.defer({
          assign_fn: (function() {
            return function() {
              return which = arguments[0];
            };
          })(),
          lineno: 22
        }));
        __iced_deferrals._fulfill();
      });
    })(this)((function(_this) {
      return function() {
        if (res) {
          res[0] = which;
        }
        return cb.apply(null, arr);
      };
    })(this));
  };

  exports.timeout = function(cb, t, res) {
    var tmp;
    tmp = [];
    _timeout(cb, t, res, tmp);
    return tmp[0];
  };

  _iand = function(cb, res, tmp) {
    var ok, ___iced_passed_deferral, __iced_deferrals, __iced_k;
    __iced_k = __iced_k_noop;
    ___iced_passed_deferral = iced.findDeferral(arguments);
    (function(_this) {
      return (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral,
          filename: "/Users/max/src/iced/iced-runtime/src/library.iced"
        });
        tmp[0] = __iced_deferrals.defer({
          assign_fn: (function() {
            return function() {
              return ok = arguments[0];
            };
          })(),
          lineno: 39
        });
        __iced_deferrals._fulfill();
      });
    })(this)((function(_this) {
      return function() {
        if (!ok) {
          res[0] = false;
        }
        return cb();
      };
    })(this));
  };

  exports.iand = function(cb, res) {
    var tmp;
    tmp = [];
    _iand(cb, res, tmp);
    return tmp[0];
  };

  _ior = function(cb, res, tmp) {
    var ok, ___iced_passed_deferral, __iced_deferrals, __iced_k;
    __iced_k = __iced_k_noop;
    ___iced_passed_deferral = iced.findDeferral(arguments);
    (function(_this) {
      return (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral,
          filename: "/Users/max/src/iced/iced-runtime/src/library.iced"
        });
        tmp[0] = __iced_deferrals.defer({
          assign_fn: (function() {
            return function() {
              return ok = arguments[0];
            };
          })(),
          lineno: 58
        });
        __iced_deferrals._fulfill();
      });
    })(this)((function(_this) {
      return function() {
        if (ok) {
          res[0] = true;
        }
        return cb();
      };
    })(this));
  };

  exports.ior = function(cb, res) {
    var tmp;
    tmp = [];
    _ior(cb, res, tmp);
    return tmp[0];
  };

  exports.Pipeliner = Pipeliner = (function() {
    function Pipeliner(window, delay) {
      this.window = window || 1;
      this.delay = delay || 0;
      this.queue = [];
      this.n_out = 0;
      this.cb = null;
      this[C.deferrals] = this;
      this["defer"] = this._defer;
    }

    Pipeliner.prototype.waitInQueue = function(cb) {
      var ___iced_passed_deferral, __iced_deferrals, __iced_k;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      (function(_this) {
        return (function(__iced_k) {
          var _while;
          _while = function(__iced_k) {
            var _break, _continue, _next;
            _break = __iced_k;
            _continue = function() {
              return iced.trampoline(function() {
                return _while(__iced_k);
              });
            };
            _next = _continue;
            if (!(_this.n_out >= _this.window)) {
              return _break();
            } else {
              (function(__iced_k) {
                __iced_deferrals = new iced.Deferrals(__iced_k, {
                  parent: ___iced_passed_deferral,
                  filename: "/Users/max/src/iced/iced-runtime/src/library.iced",
                  funcname: "Pipeliner.waitInQueue"
                });
                _this.cb = __iced_deferrals.defer({
                  lineno: 100
                });
                __iced_deferrals._fulfill();
              })(_next);
            }
          };
          _while(__iced_k);
        });
      })(this)((function(_this) {
        return function() {
          _this.n_out++;
          (function(__iced_k) {
            if (_this.delay) {
              (function(__iced_k) {
                __iced_deferrals = new iced.Deferrals(__iced_k, {
                  parent: ___iced_passed_deferral,
                  filename: "/Users/max/src/iced/iced-runtime/src/library.iced",
                  funcname: "Pipeliner.waitInQueue"
                });
                setTimeout(__iced_deferrals.defer({
                  lineno: 108
                }), _this.delay);
                __iced_deferrals._fulfill();
              })(__iced_k);
            } else {
              return __iced_k();
            }
          })(function() {
            return cb();
          });
        };
      })(this));
    };

    Pipeliner.prototype.__defer = function(out, deferArgs) {
      var tmp, voidCb, ___iced_passed_deferral, __iced_deferrals, __iced_k;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      (function(_this) {
        return (function(__iced_k) {
          __iced_deferrals = new iced.Deferrals(__iced_k, {
            parent: ___iced_passed_deferral,
            filename: "/Users/max/src/iced/iced-runtime/src/library.iced",
            funcname: "Pipeliner.__defer"
          });
          voidCb = __iced_deferrals.defer({
            lineno: 122
          });
          out[0] = function() {
            var args, _ref;
            args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
            if ((_ref = deferArgs.assign_fn) != null) {
              _ref.apply(null, args);
            }
            return voidCb();
          };
          __iced_deferrals._fulfill();
        });
      })(this)((function(_this) {
        return function() {
          _this.n_out--;
          if (_this.cb) {
            tmp = _this.cb;
            _this.cb = null;
            return tmp();
          }
        };
      })(this));
    };

    Pipeliner.prototype._defer = function(deferArgs) {
      var tmp;
      tmp = [];
      this.__defer(tmp, deferArgs);
      return tmp[0];
    };

    Pipeliner.prototype.flush = function(autocb) {
      var ___iced_passed_deferral, __iced_k, _while;
      __iced_k = autocb;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      _while = (function(_this) {
        var __iced_deferrals;
        return function(__iced_k) {
          var _break, _continue, _next;
          _break = __iced_k;
          _continue = function() {
            return iced.trampoline(function() {
              return _while(__iced_k);
            });
          };
          _next = _continue;
          if (!_this.n_out) {
            return _break();
          } else {
            (function(__iced_k) {
              __iced_deferrals = new iced.Deferrals(__iced_k, {
                parent: ___iced_passed_deferral,
                filename: "/Users/max/src/iced/iced-runtime/src/library.iced",
                funcname: "Pipeliner.flush"
              });
              _this.cb = __iced_deferrals.defer({
                lineno: 151
              });
              __iced_deferrals._fulfill();
            })(_next);
          }
        };
      })(this);
      _while(__iced_k);
    };

    return Pipeliner;

  })();

}).call(this);

},{"./const":11,"./runtime":14}],13:[function(require,module,exports){
// Generated by IcedCoffeeScript 108.0.8
(function() {
  var k, mod, mods, v, _i, _len;

  exports["const"] = require('./const');

  mods = [require('./runtime'), require('./library')];

  for (_i = 0, _len = mods.length; _i < _len; _i++) {
    mod = mods[_i];
    for (k in mod) {
      v = mod[k];
      exports[k] = v;
    }
  }

}).call(this);

},{"./const":11,"./library":12,"./runtime":14}],14:[function(require,module,exports){
(function (process){
// Generated by IcedCoffeeScript 108.0.8
(function() {
  var C, Deferrals, Rendezvous, exceptionHandler, findDeferral, make_defer_return, stackWalk, tick_counter, trampoline, warn, __active_trace, __c, _trace_to_string,
    __slice = [].slice;

  C = require('./const');

  make_defer_return = function(obj, defer_args, id, trace_template, multi) {
    var k, ret, trace, v;
    trace = {};
    for (k in trace_template) {
      v = trace_template[k];
      trace[k] = v;
    }
    trace[C.lineno] = defer_args != null ? defer_args[C.lineno] : void 0;
    ret = function() {
      var inner_args, o, _ref;
      inner_args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      if (defer_args != null) {
        if ((_ref = defer_args.assign_fn) != null) {
          _ref.apply(null, inner_args);
        }
      }
      if (obj) {
        o = obj;
        if (!multi) {
          obj = null;
        }
        return o._fulfill(id, trace);
      } else {
        return warn("overused deferral at " + (_trace_to_string(trace)));
      }
    };
    ret[C.trace] = trace;
    return ret;
  };

  __c = 0;

  tick_counter = function(mod) {
    __c++;
    if ((__c % mod) === 0) {
      __c = 0;
      return true;
    } else {
      return false;
    }
  };

  __active_trace = null;

  _trace_to_string = function(tr) {
    var fn;
    fn = tr[C.funcname] || "<anonymous>";
    return "" + fn + " (" + tr[C.filename] + ":" + (tr[C.lineno] + 1) + ")";
  };

  warn = function(m) {
    return typeof console !== "undefined" && console !== null ? console.error("ICED warning: " + m) : void 0;
  };

  exports.trampoline = trampoline = function(fn) {
    if (!tick_counter(500)) {
      return fn();
    } else if ((typeof process !== "undefined" && process !== null ? process.nextTick : void 0) != null) {
      return process.nextTick(fn);
    } else {
      return setTimeout(fn);
    }
  };

  exports.Deferrals = Deferrals = (function() {
    function Deferrals(k, trace) {
      this.trace = trace;
      this.continuation = k;
      this.count = 1;
      this.ret = null;
    }

    Deferrals.prototype._call = function(trace) {
      var c;
      if (this.continuation) {
        __active_trace = trace;
        c = this.continuation;
        this.continuation = null;
        return c(this.ret);
      } else {
        return warn("Entered dead await at " + (_trace_to_string(trace)));
      }
    };

    Deferrals.prototype._fulfill = function(id, trace) {
      if (--this.count > 0) {

      } else {
        return trampoline(((function(_this) {
          return function() {
            return _this._call(trace);
          };
        })(this)));
      }
    };

    Deferrals.prototype.defer = function(args) {
      var self;
      this.count++;
      self = this;
      return make_defer_return(self, args, null, this.trace);
    };

    return Deferrals;

  })();

  exports.findDeferral = findDeferral = function(args) {
    var a, _i, _len;
    for (_i = 0, _len = args.length; _i < _len; _i++) {
      a = args[_i];
      if (a != null ? a[C.trace] : void 0) {
        return a;
      }
    }
    return null;
  };

  exports.Rendezvous = Rendezvous = (function() {
    var RvId;

    function Rendezvous() {
      this.completed = [];
      this.waiters = [];
      this.defer_id = 0;
    }

    RvId = (function() {
      function RvId(rv, id, multi) {
        this.rv = rv;
        this.id = id;
        this.multi = multi;
      }

      RvId.prototype.defer = function(defer_args) {
        return this.rv._defer_with_id(this.id, defer_args, this.multi);
      };

      return RvId;

    })();

    Rendezvous.prototype.wait = function(cb) {
      var x;
      if (this.completed.length) {
        x = this.completed.shift();
        return cb(x);
      } else {
        return this.waiters.push(cb);
      }
    };

    Rendezvous.prototype.defer = function(defer_args) {
      var id;
      id = this.defer_id++;
      return this._defer_with_id(id, defer_args);
    };

    Rendezvous.prototype.id = function(i, multi) {
      multi = !!multi;
      return new RvId(this, i, multi);
    };

    Rendezvous.prototype._fulfill = function(id, trace) {
      var cb;
      if (this.waiters.length) {
        cb = this.waiters.shift();
        return cb(id);
      } else {
        return this.completed.push(id);
      }
    };

    Rendezvous.prototype._defer_with_id = function(id, defer_args, multi) {
      this.count++;
      return make_defer_return(this, defer_args, id, {}, multi);
    };

    return Rendezvous;

  })();

  exports.stackWalk = stackWalk = function(cb) {
    var line, ret, tr, _ref;
    ret = [];
    tr = cb ? cb[C.trace] : __active_trace;
    while (tr) {
      line = "   at " + (_trace_to_string(tr));
      ret.push(line);
      tr = tr != null ? (_ref = tr[C.parent]) != null ? _ref[C.trace] : void 0 : void 0;
    }
    return ret;
  };

  exports.exceptionHandler = exceptionHandler = function(err, logger) {
    var stack;
    if (!logger) {
      logger = console.error;
    }
    logger(err.stack);
    stack = stackWalk();
    if (stack.length) {
      logger("Iced 'stack' trace (w/ real line numbers):");
      return logger(stack.join("\n"));
    }
  };

  exports.catchExceptions = function(logger) {
    return typeof process !== "undefined" && process !== null ? process.on('uncaughtException', function(err) {
      exceptionHandler(err, logger);
      return process.exit(1);
    }) : void 0;
  };

}).call(this);

}).call(this,require('_process'))
},{"./const":11,"_process":6}],15:[function(require,module,exports){

var lib = require('./lib/lib.js');

// This is actually the one function that we expose.  The rest
// isn't ready to use, yet.
exports.generate = function(buffer) {
    var a = new Array(buffer.length);
    var i;
    for (i = 0; i < buffer.length; i++) {
        a[i] = buffer.readUInt8(i);
    }
    var key = new lib.Bitcoin.ECKey(a);
    var ret = {
        "public"  : key.getBitcoinAddress(),
        "private" : key.getBitcoinWalletImportFormat()
    };
    return ret;
};

},{"./lib/lib.js":16}],16:[function(require,module,exports){

var Crypto = exports.Crypto = {};
var Bitcoin = exports.Bitcoin = {};
// Array.prototype.map function is in the public domain.
// Production steps of ECMA-262, Edition 5, 15.4.4.19  
// Reference: http://es5.github.com/#x15.4.4.19  
if (!Array.prototype.map) {
	Array.prototype.map = function (callback, thisArg) {
		var T, A, k;
		if (this == null) {
			throw new TypeError(" this is null or not defined");
		}
		// 1. Let O be the result of calling ToObject passing the |this| value as the argument.  
		var O = Object(this);
		// 2. Let lenValue be the result of calling the Get internal method of O with the argument "length".  
		// 3. Let len be ToUint32(lenValue).  
		var len = O.length >>> 0;
		// 4. If IsCallable(callback) is false, throw a TypeError exception.  
		// See: http://es5.github.com/#x9.11  
		if ({}.toString.call(callback) != "[object Function]") {
			throw new TypeError(callback + " is not a function");
		}
		// 5. If thisArg was supplied, let T be thisArg; else let T be undefined.  
		if (thisArg) {
			T = thisArg;
		}
		// 6. Let A be a new array created as if by the expression new Array(len) where Array is  
		// the standard built-in constructor with that name and len is the value of len.  
		A = new Array(len);
		// 7. Let k be 0  
		k = 0;
		// 8. Repeat, while k < len  
		while (k < len) {
			var kValue, mappedValue;
			// a. Let Pk be ToString(k).  
			//   This is implicit for LHS operands of the in operator  
			// b. Let kPresent be the result of calling the HasProperty internal method of O with argument Pk.  
			//   This step can be combined with c  
			// c. If kPresent is true, then  
			if (k in O) {
				// i. Let kValue be the result of calling the Get internal method of O with argument Pk.  
				kValue = O[k];
				// ii. Let mappedValue be the result of calling the Call internal method of callback  
				// with T as the this value and argument list containing kValue, k, and O.  
				mappedValue = callback.call(T, kValue, k, O);
				// iii. Call the DefineOwnProperty internal method of A with arguments  
				// Pk, Property Descriptor {Value: mappedValue, Writable: true, Enumerable: true, Configurable: true},  
				// and false.  
				// In browsers that support Object.defineProperty, use the following:  
				// Object.defineProperty(A, Pk, { value: mappedValue, writable: true, enumerable: true, configurable: true });  
				// For best browser support, use the following:  
				A[k] = mappedValue;
			}
			// d. Increase k by 1.  
			k++;
		}
		// 9. return A  
		return A;
	};
}/*!
* Basic JavaScript BN library - subset useful for RSA encryption. v1.3
* 
* Copyright (c) 2005  Tom Wu
* All Rights Reserved.
* BSD License
* http://www-cs-students.stanford.edu/~tjw/jsbn/LICENSE
*
* Copyright Stephan Thomas
* Copyright bitaddress.org
*/


(function (x) {

	// (public) Constructor function of Global BigInteger object
	var BigInteger = x.BigInteger = function BigInteger(a, b, c) {
		if (a != null)
			if ("number" == typeof a) this.fromNumber(a, b, c);
			else if (b == null && "string" != typeof a) this.fromString(a, 256);
			else this.fromString(a, b);
	};

	// Bits per digit
	var dbits;

	// JavaScript engine analysis
	var canary = 0xdeadbeefcafe;
	var j_lm = ((canary & 0xffffff) == 0xefcafe);

	// return new, unset BigInteger
	function nbi() { return new BigInteger(null); }

	// am: Compute w_j += (x*this_i), propagate carries,
	// c is initial carry, returns final carry.
	// c < 3*dvalue, x < 2*dvalue, this_i < dvalue
	// We need to select the fastest one that works in this environment.

	// am1: use a single mult and divide to get the high bits,
	// max digit bits should be 26 because
	// max internal value = 2*dvalue^2-2*dvalue (< 2^53)
	function am1(i, x, w, j, c, n) {
		while (--n >= 0) {
			var v = x * this[i++] + w[j] + c;
			c = Math.floor(v / 0x4000000);
			w[j++] = v & 0x3ffffff;
		}
		return c;
	}
	// am2 avoids a big mult-and-extract completely.
	// Max digit bits should be <= 30 because we do bitwise ops
	// on values up to 2*hdvalue^2-hdvalue-1 (< 2^31)
	function am2(i, x, w, j, c, n) {
		var xl = x & 0x7fff, xh = x >> 15;
		while (--n >= 0) {
			var l = this[i] & 0x7fff;
			var h = this[i++] >> 15;
			var m = xh * l + h * xl;
			l = xl * l + ((m & 0x7fff) << 15) + w[j] + (c & 0x3fffffff);
			c = (l >>> 30) + (m >>> 15) + xh * h + (c >>> 30);
			w[j++] = l & 0x3fffffff;
		}
		return c;
	}
	// Alternately, set max digit bits to 28 since some
	// browsers slow down when dealing with 32-bit numbers.
	function am3(i, x, w, j, c, n) {
		var xl = x & 0x3fff, xh = x >> 14;
		while (--n >= 0) {
			var l = this[i] & 0x3fff;
			var h = this[i++] >> 14;
			var m = xh * l + h * xl;
			l = xl * l + ((m & 0x3fff) << 14) + w[j] + c;
			c = (l >> 28) + (m >> 14) + xh * h;
			w[j++] = l & 0xfffffff;
		}
		return c;
	}

	// Hardcode this for modern browsers
	BigInteger.prototype.am = am3;
	dbits = 28;

	BigInteger.prototype.DB = dbits;
	BigInteger.prototype.DM = ((1 << dbits) - 1);
	BigInteger.prototype.DV = (1 << dbits);

	var BI_FP = 52;
	BigInteger.prototype.FV = Math.pow(2, BI_FP);
	BigInteger.prototype.F1 = BI_FP - dbits;
	BigInteger.prototype.F2 = 2 * dbits - BI_FP;

	// Digit conversions
	var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
	var BI_RC = new Array();
	var rr, vv;
	rr = "0".charCodeAt(0);
	for (vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
	rr = "a".charCodeAt(0);
	for (vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
	rr = "A".charCodeAt(0);
	for (vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;

	function int2char(n) { return BI_RM.charAt(n); }
	function intAt(s, i) {
		var c = BI_RC[s.charCodeAt(i)];
		return (c == null) ? -1 : c;
	}



	// return bigint initialized to value
	function nbv(i) { var r = nbi(); r.fromInt(i); return r; }


	// returns bit length of the integer x
	function nbits(x) {
		var r = 1, t;
		if ((t = x >>> 16) != 0) { x = t; r += 16; }
		if ((t = x >> 8) != 0) { x = t; r += 8; }
		if ((t = x >> 4) != 0) { x = t; r += 4; }
		if ((t = x >> 2) != 0) { x = t; r += 2; }
		if ((t = x >> 1) != 0) { x = t; r += 1; }
		return r;
	}







	// (protected) copy this to r
	BigInteger.prototype.copyTo = function (r) {
		for (var i = this.t - 1; i >= 0; --i) r[i] = this[i];
		r.t = this.t;
		r.s = this.s;
	};


	// (protected) set from integer value x, -DV <= x < DV
	BigInteger.prototype.fromInt = function (x) {
		this.t = 1;
		this.s = (x < 0) ? -1 : 0;
		if (x > 0) this[0] = x;
		else if (x < -1) this[0] = x + DV;
		else this.t = 0;
	};

	// (protected) set from string and radix
	BigInteger.prototype.fromString = function (s, b) {
		var k;
		if (b == 16) k = 4;
		else if (b == 8) k = 3;
		else if (b == 256) k = 8; // byte array
		else if (b == 2) k = 1;
		else if (b == 32) k = 5;
		else if (b == 4) k = 2;
		else { this.fromRadix(s, b); return; }
		this.t = 0;
		this.s = 0;
		var i = s.length, mi = false, sh = 0;
		while (--i >= 0) {
			var x = (k == 8) ? s[i] & 0xff : intAt(s, i);
			if (x < 0) {
				if (s.charAt(i) == "-") mi = true;
				continue;
			}
			mi = false;
			if (sh == 0)
				this[this.t++] = x;
			else if (sh + k > this.DB) {
				this[this.t - 1] |= (x & ((1 << (this.DB - sh)) - 1)) << sh;
				this[this.t++] = (x >> (this.DB - sh));
			}
			else
				this[this.t - 1] |= x << sh;
			sh += k;
			if (sh >= this.DB) sh -= this.DB;
		}
		if (k == 8 && (s[0] & 0x80) != 0) {
			this.s = -1;
			if (sh > 0) this[this.t - 1] |= ((1 << (this.DB - sh)) - 1) << sh;
		}
		this.clamp();
		if (mi) BigInteger.ZERO.subTo(this, this);
	};


	// (protected) clamp off excess high words
	BigInteger.prototype.clamp = function () {
		var c = this.s & this.DM;
		while (this.t > 0 && this[this.t - 1] == c) --this.t;
	};

	// (protected) r = this << n*DB
	BigInteger.prototype.dlShiftTo = function (n, r) {
		var i;
		for (i = this.t - 1; i >= 0; --i) r[i + n] = this[i];
		for (i = n - 1; i >= 0; --i) r[i] = 0;
		r.t = this.t + n;
		r.s = this.s;
	};

	// (protected) r = this >> n*DB
	BigInteger.prototype.drShiftTo = function (n, r) {
		for (var i = n; i < this.t; ++i) r[i - n] = this[i];
		r.t = Math.max(this.t - n, 0);
		r.s = this.s;
	};


	// (protected) r = this << n
	BigInteger.prototype.lShiftTo = function (n, r) {
		var bs = n % this.DB;
		var cbs = this.DB - bs;
		var bm = (1 << cbs) - 1;
		var ds = Math.floor(n / this.DB), c = (this.s << bs) & this.DM, i;
		for (i = this.t - 1; i >= 0; --i) {
			r[i + ds + 1] = (this[i] >> cbs) | c;
			c = (this[i] & bm) << bs;
		}
		for (i = ds - 1; i >= 0; --i) r[i] = 0;
		r[ds] = c;
		r.t = this.t + ds + 1;
		r.s = this.s;
		r.clamp();
	};


	// (protected) r = this >> n
	BigInteger.prototype.rShiftTo = function (n, r) {
		r.s = this.s;
		var ds = Math.floor(n / this.DB);
		if (ds >= this.t) { r.t = 0; return; }
		var bs = n % this.DB;
		var cbs = this.DB - bs;
		var bm = (1 << bs) - 1;
		r[0] = this[ds] >> bs;
		for (var i = ds + 1; i < this.t; ++i) {
			r[i - ds - 1] |= (this[i] & bm) << cbs;
			r[i - ds] = this[i] >> bs;
		}
		if (bs > 0) r[this.t - ds - 1] |= (this.s & bm) << cbs;
		r.t = this.t - ds;
		r.clamp();
	};


	// (protected) r = this - a
	BigInteger.prototype.subTo = function (a, r) {
		var i = 0, c = 0, m = Math.min(a.t, this.t);
		while (i < m) {
			c += this[i] - a[i];
			r[i++] = c & this.DM;
			c >>= this.DB;
		}
		if (a.t < this.t) {
			c -= a.s;
			while (i < this.t) {
				c += this[i];
				r[i++] = c & this.DM;
				c >>= this.DB;
			}
			c += this.s;
		}
		else {
			c += this.s;
			while (i < a.t) {
				c -= a[i];
				r[i++] = c & this.DM;
				c >>= this.DB;
			}
			c -= a.s;
		}
		r.s = (c < 0) ? -1 : 0;
		if (c < -1) r[i++] = this.DV + c;
		else if (c > 0) r[i++] = c;
		r.t = i;
		r.clamp();
	};


	// (protected) r = this * a, r != this,a (HAC 14.12)
	// "this" should be the larger one if appropriate.
	BigInteger.prototype.multiplyTo = function (a, r) {
		var x = this.abs(), y = a.abs();
		var i = x.t;
		r.t = i + y.t;
		while (--i >= 0) r[i] = 0;
		for (i = 0; i < y.t; ++i) r[i + x.t] = x.am(0, y[i], r, i, 0, x.t);
		r.s = 0;
		r.clamp();
		if (this.s != a.s) BigInteger.ZERO.subTo(r, r);
	};


	// (protected) r = this^2, r != this (HAC 14.16)
	BigInteger.prototype.squareTo = function (r) {
		var x = this.abs();
		var i = r.t = 2 * x.t;
		while (--i >= 0) r[i] = 0;
		for (i = 0; i < x.t - 1; ++i) {
			var c = x.am(i, x[i], r, 2 * i, 0, 1);
			if ((r[i + x.t] += x.am(i + 1, 2 * x[i], r, 2 * i + 1, c, x.t - i - 1)) >= x.DV) {
				r[i + x.t] -= x.DV;
				r[i + x.t + 1] = 1;
			}
		}
		if (r.t > 0) r[r.t - 1] += x.am(i, x[i], r, 2 * i, 0, 1);
		r.s = 0;
		r.clamp();
	};



	// (protected) divide this by m, quotient and remainder to q, r (HAC 14.20)
	// r != q, this != m.  q or r may be null.
	BigInteger.prototype.divRemTo = function (m, q, r) {
		var pm = m.abs();
		if (pm.t <= 0) return;
		var pt = this.abs();
		if (pt.t < pm.t) {
			if (q != null) q.fromInt(0);
			if (r != null) this.copyTo(r);
			return;
		}
		if (r == null) r = nbi();
		var y = nbi(), ts = this.s, ms = m.s;
		var nsh = this.DB - nbits(pm[pm.t - 1]); // normalize modulus
		if (nsh > 0) { pm.lShiftTo(nsh, y); pt.lShiftTo(nsh, r); }
		else { pm.copyTo(y); pt.copyTo(r); }
		var ys = y.t;
		var y0 = y[ys - 1];
		if (y0 == 0) return;
		var yt = y0 * (1 << this.F1) + ((ys > 1) ? y[ys - 2] >> this.F2 : 0);
		var d1 = this.FV / yt, d2 = (1 << this.F1) / yt, e = 1 << this.F2;
		var i = r.t, j = i - ys, t = (q == null) ? nbi() : q;
		y.dlShiftTo(j, t);
		if (r.compareTo(t) >= 0) {
			r[r.t++] = 1;
			r.subTo(t, r);
		}
		BigInteger.ONE.dlShiftTo(ys, t);
		t.subTo(y, y); // "negative" y so we can replace sub with am later
		while (y.t < ys) y[y.t++] = 0;
		while (--j >= 0) {
			// Estimate quotient digit
			var qd = (r[--i] == y0) ? this.DM : Math.floor(r[i] * d1 + (r[i - 1] + e) * d2);
			if ((r[i] += y.am(0, qd, r, j, 0, ys)) < qd) {	// Try it out
				y.dlShiftTo(j, t);
				r.subTo(t, r);
				while (r[i] < --qd) r.subTo(t, r);
			}
		}
		if (q != null) {
			r.drShiftTo(ys, q);
			if (ts != ms) BigInteger.ZERO.subTo(q, q);
		}
		r.t = ys;
		r.clamp();
		if (nsh > 0) r.rShiftTo(nsh, r); // Denormalize remainder
		if (ts < 0) BigInteger.ZERO.subTo(r, r);
	};


	// (protected) return "-1/this % 2^DB"; useful for Mont. reduction
	// justification:
	//         xy == 1 (mod m)
	//         xy =  1+km
	//   xy(2-xy) = (1+km)(1-km)
	// x[y(2-xy)] = 1-k^2m^2
	// x[y(2-xy)] == 1 (mod m^2)
	// if y is 1/x mod m, then y(2-xy) is 1/x mod m^2
	// should reduce x and y(2-xy) by m^2 at each step to keep size bounded.
	// JS multiply "overflows" differently from C/C++, so care is needed here.
	BigInteger.prototype.invDigit = function () {
		if (this.t < 1) return 0;
		var x = this[0];
		if ((x & 1) == 0) return 0;
		var y = x & 3; 	// y == 1/x mod 2^2
		y = (y * (2 - (x & 0xf) * y)) & 0xf; // y == 1/x mod 2^4
		y = (y * (2 - (x & 0xff) * y)) & 0xff; // y == 1/x mod 2^8
		y = (y * (2 - (((x & 0xffff) * y) & 0xffff))) & 0xffff; // y == 1/x mod 2^16
		// last step - calculate inverse mod DV directly;
		// assumes 16 < DB <= 32 and assumes ability to handle 48-bit ints
		y = (y * (2 - x * y % this.DV)) % this.DV; 	// y == 1/x mod 2^dbits
		// we really want the negative inverse, and -DV < y < DV
		return (y > 0) ? this.DV - y : -y;
	};


	// (protected) true iff this is even
	BigInteger.prototype.isEven = function () { return ((this.t > 0) ? (this[0] & 1) : this.s) == 0; };


	// (protected) this^e, e < 2^32, doing sqr and mul with "r" (HAC 14.79)
	BigInteger.prototype.exp = function (e, z) {
		if (e > 0xffffffff || e < 1) return BigInteger.ONE;
		var r = nbi(), r2 = nbi(), g = z.convert(this), i = nbits(e) - 1;
		g.copyTo(r);
		while (--i >= 0) {
			z.sqrTo(r, r2);
			if ((e & (1 << i)) > 0) z.mulTo(r2, g, r);
			else { var t = r; r = r2; r2 = t; }
		}
		return z.revert(r);
	};


	// (public) return string representation in given radix
	BigInteger.prototype.toString = function (b) {
		if (this.s < 0) return "-" + this.negate().toString(b);
		var k;
		if (b == 16) k = 4;
		else if (b == 8) k = 3;
		else if (b == 2) k = 1;
		else if (b == 32) k = 5;
		else if (b == 4) k = 2;
		else return this.toRadix(b);
		var km = (1 << k) - 1, d, m = false, r = "", i = this.t;
		var p = this.DB - (i * this.DB) % k;
		if (i-- > 0) {
			if (p < this.DB && (d = this[i] >> p) > 0) { m = true; r = int2char(d); }
			while (i >= 0) {
				if (p < k) {
					d = (this[i] & ((1 << p) - 1)) << (k - p);
					d |= this[--i] >> (p += this.DB - k);
				}
				else {
					d = (this[i] >> (p -= k)) & km;
					if (p <= 0) { p += this.DB; --i; }
				}
				if (d > 0) m = true;
				if (m) r += int2char(d);
			}
		}
		return m ? r : "0";
	};


	// (public) -this
	BigInteger.prototype.negate = function () { var r = nbi(); BigInteger.ZERO.subTo(this, r); return r; };

	// (public) |this|
	BigInteger.prototype.abs = function () { return (this.s < 0) ? this.negate() : this; };

	// (public) return + if this > a, - if this < a, 0 if equal
	BigInteger.prototype.compareTo = function (a) {
		var r = this.s - a.s;
		if (r != 0) return r;
		var i = this.t;
		r = i - a.t;
		if (r != 0) return (this.s < 0) ? -r : r;
		while (--i >= 0) if ((r = this[i] - a[i]) != 0) return r;
		return 0;
	}

	// (public) return the number of bits in "this"
	BigInteger.prototype.bitLength = function () {
		if (this.t <= 0) return 0;
		return this.DB * (this.t - 1) + nbits(this[this.t - 1] ^ (this.s & this.DM));
	};

	// (public) this mod a
	BigInteger.prototype.mod = function (a) {
		var r = nbi();
		this.abs().divRemTo(a, null, r);
		if (this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r, r);
		return r;
	}

	// (public) this^e % m, 0 <= e < 2^32
	BigInteger.prototype.modPowInt = function (e, m) {
		var z;
		if (e < 256 || m.isEven()) z = new Classic(m); else z = new Montgomery(m);
		return this.exp(e, z);
	};

	// "constants"
	BigInteger.ZERO = nbv(0);
	BigInteger.ONE = nbv(1);







	// Copyright (c) 2005-2009  Tom Wu
	// All Rights Reserved.
	// See "LICENSE" for details.
	// Extended JavaScript BN functions, required for RSA private ops.
	// Version 1.1: new BigInteger("0", 10) returns "proper" zero
	// Version 1.2: square() API, isProbablePrime fix


	// return index of lowest 1-bit in x, x < 2^31
	function lbit(x) {
		if (x == 0) return -1;
		var r = 0;
		if ((x & 0xffff) == 0) { x >>= 16; r += 16; }
		if ((x & 0xff) == 0) { x >>= 8; r += 8; }
		if ((x & 0xf) == 0) { x >>= 4; r += 4; }
		if ((x & 3) == 0) { x >>= 2; r += 2; }
		if ((x & 1) == 0) ++r;
		return r;
	}

	// return number of 1 bits in x
	function cbit(x) {
		var r = 0;
		while (x != 0) { x &= x - 1; ++r; }
		return r;
	}

	var lowprimes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547, 557, 563, 569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659, 661, 673, 677, 683, 691, 701, 709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797, 809, 811, 821, 823, 827, 829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929, 937, 941, 947, 953, 967, 971, 977, 983, 991, 997];
	var lplim = (1 << 26) / lowprimes[lowprimes.length - 1];



	// (protected) return x s.t. r^x < DV
	BigInteger.prototype.chunkSize = function (r) { return Math.floor(Math.LN2 * this.DB / Math.log(r)); };

	// (protected) convert to radix string
	BigInteger.prototype.toRadix = function (b) {
		if (b == null) b = 10;
		if (this.signum() == 0 || b < 2 || b > 36) return "0";
		var cs = this.chunkSize(b);
		var a = Math.pow(b, cs);
		var d = nbv(a), y = nbi(), z = nbi(), r = "";
		this.divRemTo(d, y, z);
		while (y.signum() > 0) {
			r = (a + z.intValue()).toString(b).substr(1) + r;
			y.divRemTo(d, y, z);
		}
		return z.intValue().toString(b) + r;
	};

	// (protected) convert from radix string
	BigInteger.prototype.fromRadix = function (s, b) {
		this.fromInt(0);
		if (b == null) b = 10;
		var cs = this.chunkSize(b);
		var d = Math.pow(b, cs), mi = false, j = 0, w = 0;
		for (var i = 0; i < s.length; ++i) {
			var x = intAt(s, i);
			if (x < 0) {
				if (s.charAt(i) == "-" && this.signum() == 0) mi = true;
				continue;
			}
			w = b * w + x;
			if (++j >= cs) {
				this.dMultiply(d);
				this.dAddOffset(w, 0);
				j = 0;
				w = 0;
			}
		}
		if (j > 0) {
			this.dMultiply(Math.pow(b, j));
			this.dAddOffset(w, 0);
		}
		if (mi) BigInteger.ZERO.subTo(this, this);
	};

	// (protected) alternate constructor
	BigInteger.prototype.fromNumber = function (a, b, c) {
		if ("number" == typeof b) {
			// new BigInteger(int,int,RNG)
			if (a < 2) this.fromInt(1);
			else {
				this.fromNumber(a, c);
				if (!this.testBit(a - 1))	// force MSB set
					this.bitwiseTo(BigInteger.ONE.shiftLeft(a - 1), op_or, this);
				if (this.isEven()) this.dAddOffset(1, 0); // force odd
				while (!this.isProbablePrime(b)) {
					this.dAddOffset(2, 0);
					if (this.bitLength() > a) this.subTo(BigInteger.ONE.shiftLeft(a - 1), this);
				}
			}
		}
		else {
			// new BigInteger(int,RNG)
			var x = new Array(), t = a & 7;
			x.length = (a >> 3) + 1;
			b.nextBytes(x);
			if (t > 0) x[0] &= ((1 << t) - 1); else x[0] = 0;
			this.fromString(x, 256);
		}
	};

	// (protected) r = this op a (bitwise)
	BigInteger.prototype.bitwiseTo = function (a, op, r) {
		var i, f, m = Math.min(a.t, this.t);
		for (i = 0; i < m; ++i) r[i] = op(this[i], a[i]);
		if (a.t < this.t) {
			f = a.s & this.DM;
			for (i = m; i < this.t; ++i) r[i] = op(this[i], f);
			r.t = this.t;
		}
		else {
			f = this.s & this.DM;
			for (i = m; i < a.t; ++i) r[i] = op(f, a[i]);
			r.t = a.t;
		}
		r.s = op(this.s, a.s);
		r.clamp();
	};

	// (protected) this op (1<<n)
	BigInteger.prototype.changeBit = function (n, op) {
		var r = BigInteger.ONE.shiftLeft(n);
		this.bitwiseTo(r, op, r);
		return r;
	};

	// (protected) r = this + a
	BigInteger.prototype.addTo = function (a, r) {
		var i = 0, c = 0, m = Math.min(a.t, this.t);
		while (i < m) {
			c += this[i] + a[i];
			r[i++] = c & this.DM;
			c >>= this.DB;
		}
		if (a.t < this.t) {
			c += a.s;
			while (i < this.t) {
				c += this[i];
				r[i++] = c & this.DM;
				c >>= this.DB;
			}
			c += this.s;
		}
		else {
			c += this.s;
			while (i < a.t) {
				c += a[i];
				r[i++] = c & this.DM;
				c >>= this.DB;
			}
			c += a.s;
		}
		r.s = (c < 0) ? -1 : 0;
		if (c > 0) r[i++] = c;
		else if (c < -1) r[i++] = this.DV + c;
		r.t = i;
		r.clamp();
	};

	// (protected) this *= n, this >= 0, 1 < n < DV
	BigInteger.prototype.dMultiply = function (n) {
		this[this.t] = this.am(0, n - 1, this, 0, 0, this.t);
		++this.t;
		this.clamp();
	};

	// (protected) this += n << w words, this >= 0
	BigInteger.prototype.dAddOffset = function (n, w) {
		if (n == 0) return;
		while (this.t <= w) this[this.t++] = 0;
		this[w] += n;
		while (this[w] >= this.DV) {
			this[w] -= this.DV;
			if (++w >= this.t) this[this.t++] = 0;
			++this[w];
		}
	};

	// (protected) r = lower n words of "this * a", a.t <= n
	// "this" should be the larger one if appropriate.
	BigInteger.prototype.multiplyLowerTo = function (a, n, r) {
		var i = Math.min(this.t + a.t, n);
		r.s = 0; // assumes a,this >= 0
		r.t = i;
		while (i > 0) r[--i] = 0;
		var j;
		for (j = r.t - this.t; i < j; ++i) r[i + this.t] = this.am(0, a[i], r, i, 0, this.t);
		for (j = Math.min(a.t, n); i < j; ++i) this.am(0, a[i], r, i, 0, n - i);
		r.clamp();
	};


	// (protected) r = "this * a" without lower n words, n > 0
	// "this" should be the larger one if appropriate.
	BigInteger.prototype.multiplyUpperTo = function (a, n, r) {
		--n;
		var i = r.t = this.t + a.t - n;
		r.s = 0; // assumes a,this >= 0
		while (--i >= 0) r[i] = 0;
		for (i = Math.max(n - this.t, 0); i < a.t; ++i)
			r[this.t + i - n] = this.am(n - i, a[i], r, 0, 0, this.t + i - n);
		r.clamp();
		r.drShiftTo(1, r);
	};

	// (protected) this % n, n < 2^26
	BigInteger.prototype.modInt = function (n) {
		if (n <= 0) return 0;
		var d = this.DV % n, r = (this.s < 0) ? n - 1 : 0;
		if (this.t > 0)
			if (d == 0) r = this[0] % n;
			else for (var i = this.t - 1; i >= 0; --i) r = (d * r + this[i]) % n;
		return r;
	};


	// (protected) true if probably prime (HAC 4.24, Miller-Rabin)
	BigInteger.prototype.millerRabin = function (t) {
		var n1 = this.subtract(BigInteger.ONE);
		var k = n1.getLowestSetBit();
		if (k <= 0) return false;
		var r = n1.shiftRight(k);
		t = (t + 1) >> 1;
		if (t > lowprimes.length) t = lowprimes.length;
		var a = nbi();
		for (var i = 0; i < t; ++i) {
			//Pick bases at random, instead of starting at 2
			a.fromInt(lowprimes[Math.floor(Math.random() * lowprimes.length)]);
			var y = a.modPow(r, this);
			if (y.compareTo(BigInteger.ONE) != 0 && y.compareTo(n1) != 0) {
				var j = 1;
				while (j++ < k && y.compareTo(n1) != 0) {
					y = y.modPowInt(2, this);
					if (y.compareTo(BigInteger.ONE) == 0) return false;
				}
				if (y.compareTo(n1) != 0) return false;
			}
		}
		return true;
	};



	// (public)
	BigInteger.prototype.clone = function () { var r = nbi(); this.copyTo(r); return r; };

	// (public) return value as integer
	BigInteger.prototype.intValue = function () {
		if (this.s < 0) {
			if (this.t == 1) return this[0] - this.DV;
			else if (this.t == 0) return -1;
		}
		else if (this.t == 1) return this[0];
		else if (this.t == 0) return 0;
		// assumes 16 < DB < 32
		return ((this[1] & ((1 << (32 - this.DB)) - 1)) << this.DB) | this[0];
	};


	// (public) return value as byte
	BigInteger.prototype.byteValue = function () { return (this.t == 0) ? this.s : (this[0] << 24) >> 24; };

	// (public) return value as short (assumes DB>=16)
	BigInteger.prototype.shortValue = function () { return (this.t == 0) ? this.s : (this[0] << 16) >> 16; };

	// (public) 0 if this == 0, 1 if this > 0
	BigInteger.prototype.signum = function () {
		if (this.s < 0) return -1;
		else if (this.t <= 0 || (this.t == 1 && this[0] <= 0)) return 0;
		else return 1;
	};


	// (public) convert to bigendian byte array
	BigInteger.prototype.toByteArray = function () {
		var i = this.t, r = new Array();
		r[0] = this.s;
		var p = this.DB - (i * this.DB) % 8, d, k = 0;
		if (i-- > 0) {
			if (p < this.DB && (d = this[i] >> p) != (this.s & this.DM) >> p)
				r[k++] = d | (this.s << (this.DB - p));
			while (i >= 0) {
				if (p < 8) {
					d = (this[i] & ((1 << p) - 1)) << (8 - p);
					d |= this[--i] >> (p += this.DB - 8);
				}
				else {
					d = (this[i] >> (p -= 8)) & 0xff;
					if (p <= 0) { p += this.DB; --i; }
				}
				if ((d & 0x80) != 0) d |= -256;
				if (k == 0 && (this.s & 0x80) != (d & 0x80)) ++k;
				if (k > 0 || d != this.s) r[k++] = d;
			}
		}
		return r;
	};

	BigInteger.prototype.equals = function (a) { return (this.compareTo(a) == 0); };
	BigInteger.prototype.min = function (a) { return (this.compareTo(a) < 0) ? this : a; };
	BigInteger.prototype.max = function (a) { return (this.compareTo(a) > 0) ? this : a; };

	// (public) this & a
	function op_and(x, y) { return x & y; }
	BigInteger.prototype.and = function (a) { var r = nbi(); this.bitwiseTo(a, op_and, r); return r; };

	// (public) this | a
	function op_or(x, y) { return x | y; }
	BigInteger.prototype.or = function (a) { var r = nbi(); this.bitwiseTo(a, op_or, r); return r; };

	// (public) this ^ a
	function op_xor(x, y) { return x ^ y; }
	BigInteger.prototype.xor = function (a) { var r = nbi(); this.bitwiseTo(a, op_xor, r); return r; };

	// (public) this & ~a
	function op_andnot(x, y) { return x & ~y; }
	BigInteger.prototype.andNot = function (a) { var r = nbi(); this.bitwiseTo(a, op_andnot, r); return r; };

	// (public) ~this
	BigInteger.prototype.not = function () {
		var r = nbi();
		for (var i = 0; i < this.t; ++i) r[i] = this.DM & ~this[i];
		r.t = this.t;
		r.s = ~this.s;
		return r;
	};

	// (public) this << n
	BigInteger.prototype.shiftLeft = function (n) {
		var r = nbi();
		if (n < 0) this.rShiftTo(-n, r); else this.lShiftTo(n, r);
		return r;
	};

	// (public) this >> n
	BigInteger.prototype.shiftRight = function (n) {
		var r = nbi();
		if (n < 0) this.lShiftTo(-n, r); else this.rShiftTo(n, r);
		return r;
	};

	// (public) returns index of lowest 1-bit (or -1 if none)
	BigInteger.prototype.getLowestSetBit = function () {
		for (var i = 0; i < this.t; ++i)
			if (this[i] != 0) return i * this.DB + lbit(this[i]);
		if (this.s < 0) return this.t * this.DB;
		return -1;
	};

	// (public) return number of set bits
	BigInteger.prototype.bitCount = function () {
		var r = 0, x = this.s & this.DM;
		for (var i = 0; i < this.t; ++i) r += cbit(this[i] ^ x);
		return r;
	};

	// (public) true iff nth bit is set
	BigInteger.prototype.testBit = function (n) {
		var j = Math.floor(n / this.DB);
		if (j >= this.t) return (this.s != 0);
		return ((this[j] & (1 << (n % this.DB))) != 0);
	};

	// (public) this | (1<<n)
	BigInteger.prototype.setBit = function (n) { return this.changeBit(n, op_or); };
	// (public) this & ~(1<<n)
	BigInteger.prototype.clearBit = function (n) { return this.changeBit(n, op_andnot); };
	// (public) this ^ (1<<n)
	BigInteger.prototype.flipBit = function (n) { return this.changeBit(n, op_xor); };
	// (public) this + a
	BigInteger.prototype.add = function (a) { var r = nbi(); this.addTo(a, r); return r; };
	// (public) this - a
	BigInteger.prototype.subtract = function (a) { var r = nbi(); this.subTo(a, r); return r; };
	// (public) this * a
	BigInteger.prototype.multiply = function (a) { var r = nbi(); this.multiplyTo(a, r); return r; };
	// (public) this / a
	BigInteger.prototype.divide = function (a) { var r = nbi(); this.divRemTo(a, r, null); return r; };
	// (public) this % a
	BigInteger.prototype.remainder = function (a) { var r = nbi(); this.divRemTo(a, null, r); return r; };
	// (public) [this/a,this%a]
	BigInteger.prototype.divideAndRemainder = function (a) {
		var q = nbi(), r = nbi();
		this.divRemTo(a, q, r);
		return new Array(q, r);
	};

	// (public) this^e % m (HAC 14.85)
	BigInteger.prototype.modPow = function (e, m) {
		var i = e.bitLength(), k, r = nbv(1), z;
		if (i <= 0) return r;
		else if (i < 18) k = 1;
		else if (i < 48) k = 3;
		else if (i < 144) k = 4;
		else if (i < 768) k = 5;
		else k = 6;
		if (i < 8)
			z = new Classic(m);
		else if (m.isEven())
			z = new Barrett(m);
		else
			z = new Montgomery(m);

		// precomputation
		var g = new Array(), n = 3, k1 = k - 1, km = (1 << k) - 1;
		g[1] = z.convert(this);
		if (k > 1) {
			var g2 = nbi();
			z.sqrTo(g[1], g2);
			while (n <= km) {
				g[n] = nbi();
				z.mulTo(g2, g[n - 2], g[n]);
				n += 2;
			}
		}

		var j = e.t - 1, w, is1 = true, r2 = nbi(), t;
		i = nbits(e[j]) - 1;
		while (j >= 0) {
			if (i >= k1) w = (e[j] >> (i - k1)) & km;
			else {
				w = (e[j] & ((1 << (i + 1)) - 1)) << (k1 - i);
				if (j > 0) w |= e[j - 1] >> (this.DB + i - k1);
			}

			n = k;
			while ((w & 1) == 0) { w >>= 1; --n; }
			if ((i -= n) < 0) { i += this.DB; --j; }
			if (is1) {	// ret == 1, don't bother squaring or multiplying it
				g[w].copyTo(r);
				is1 = false;
			}
			else {
				while (n > 1) { z.sqrTo(r, r2); z.sqrTo(r2, r); n -= 2; }
				if (n > 0) z.sqrTo(r, r2); else { t = r; r = r2; r2 = t; }
				z.mulTo(r2, g[w], r);
			}

			while (j >= 0 && (e[j] & (1 << i)) == 0) {
				z.sqrTo(r, r2); t = r; r = r2; r2 = t;
				if (--i < 0) { i = this.DB - 1; --j; }
			}
		}
		return z.revert(r);
	};

	// (public) 1/this % m (HAC 14.61)
	BigInteger.prototype.modInverse = function (m) {
		var ac = m.isEven();
		if ((this.isEven() && ac) || m.signum() == 0) return BigInteger.ZERO;
		var u = m.clone(), v = this.clone();
		var a = nbv(1), b = nbv(0), c = nbv(0), d = nbv(1);
		while (u.signum() != 0) {
			while (u.isEven()) {
				u.rShiftTo(1, u);
				if (ac) {
					if (!a.isEven() || !b.isEven()) { a.addTo(this, a); b.subTo(m, b); }
					a.rShiftTo(1, a);
				}
				else if (!b.isEven()) b.subTo(m, b);
				b.rShiftTo(1, b);
			}
			while (v.isEven()) {
				v.rShiftTo(1, v);
				if (ac) {
					if (!c.isEven() || !d.isEven()) { c.addTo(this, c); d.subTo(m, d); }
					c.rShiftTo(1, c);
				}
				else if (!d.isEven()) d.subTo(m, d);
				d.rShiftTo(1, d);
			}
			if (u.compareTo(v) >= 0) {
				u.subTo(v, u);
				if (ac) a.subTo(c, a);
				b.subTo(d, b);
			}
			else {
				v.subTo(u, v);
				if (ac) c.subTo(a, c);
				d.subTo(b, d);
			}
		}
		if (v.compareTo(BigInteger.ONE) != 0) return BigInteger.ZERO;
		if (d.compareTo(m) >= 0) return d.subtract(m);
		if (d.signum() < 0) d.addTo(m, d); else return d;
		if (d.signum() < 0) return d.add(m); else return d;
	};


	// (public) this^e
	BigInteger.prototype.pow = function (e) { return this.exp(e, new NullExp()); };

	// (public) gcd(this,a) (HAC 14.54)
	BigInteger.prototype.gcd = function (a) {
		var x = (this.s < 0) ? this.negate() : this.clone();
		var y = (a.s < 0) ? a.negate() : a.clone();
		if (x.compareTo(y) < 0) { var t = x; x = y; y = t; }
		var i = x.getLowestSetBit(), g = y.getLowestSetBit();
		if (g < 0) return x;
		if (i < g) g = i;
		if (g > 0) {
			x.rShiftTo(g, x);
			y.rShiftTo(g, y);
		}
		while (x.signum() > 0) {
			if ((i = x.getLowestSetBit()) > 0) x.rShiftTo(i, x);
			if ((i = y.getLowestSetBit()) > 0) y.rShiftTo(i, y);
			if (x.compareTo(y) >= 0) {
				x.subTo(y, x);
				x.rShiftTo(1, x);
			}
			else {
				y.subTo(x, y);
				y.rShiftTo(1, y);
			}
		}
		if (g > 0) y.lShiftTo(g, y);
		return y;
	};

	// (public) test primality with certainty >= 1-.5^t
	BigInteger.prototype.isProbablePrime = function (t) {
		var i, x = this.abs();
		if (x.t == 1 && x[0] <= lowprimes[lowprimes.length - 1]) {
			for (i = 0; i < lowprimes.length; ++i)
				if (x[0] == lowprimes[i]) return true;
			return false;
		}
		if (x.isEven()) return false;
		i = 1;
		while (i < lowprimes.length) {
			var m = lowprimes[i], j = i + 1;
			while (j < lowprimes.length && m < lplim) m *= lowprimes[j++];
			m = x.modInt(m);
			while (i < j) if (m % lowprimes[i++] == 0) return false;
		}
		return x.millerRabin(t);
	};


	// JSBN-specific extension

	// (public) this^2
	BigInteger.prototype.square = function () { var r = nbi(); this.squareTo(r); return r; };


	// NOTE: BigInteger interfaces not implemented in jsbn:
	// BigInteger(int signum, byte[] magnitude)
	// double doubleValue()
	// float floatValue()
	// int hashCode()
	// long longValue()
	// static BigInteger valueOf(long val)



	// Copyright Stephan Thomas (start) --- //
	// https://raw.github.com/bitcoinjs/bitcoinjs-lib/07f9d55ccb6abd962efb6befdd37671f85ea4ff9/src/util.js
	// BigInteger monkey patching
	BigInteger.valueOf = nbv;

	/**
	* Returns a byte array representation of the big integer.
	*
	* This returns the absolute of the contained value in big endian
	* form. A value of zero results in an empty array.
	*/
	BigInteger.prototype.toByteArrayUnsigned = function () {
		var ba = this.abs().toByteArray();
		if (ba.length) {
			if (ba[0] == 0) {
				ba = ba.slice(1);
			}
			return ba.map(function (v) {
				return (v < 0) ? v + 256 : v;
			});
		} else {
			// Empty array, nothing to do
			return ba;
		}
	};

	/**
	* Turns a byte array into a big integer.
	*
	* This function will interpret a byte array as a big integer in big
	* endian notation and ignore leading zeros.
	*/
	BigInteger.fromByteArrayUnsigned = function (ba) {
		if (!ba.length) {
			return ba.valueOf(0);
		} else if (ba[0] & 0x80) {
			// Prepend a zero so the BigInteger class doesn't mistake this
			// for a negative integer.
			return new BigInteger([0].concat(ba));
		} else {
			return new BigInteger(ba);
		}
	};

	/**
	* Converts big integer to signed byte representation.
	*
	* The format for this value uses a the most significant bit as a sign
	* bit. If the most significant bit is already occupied by the
	* absolute value, an extra byte is prepended and the sign bit is set
	* there.
	*
	* Examples:
	*
	*      0 =>     0x00
	*      1 =>     0x01
	*     -1 =>     0x81
	*    127 =>     0x7f
	*   -127 =>     0xff
	*    128 =>   0x0080
	*   -128 =>   0x8080
	*    255 =>   0x00ff
	*   -255 =>   0x80ff
	*  16300 =>   0x3fac
	* -16300 =>   0xbfac
	*  62300 => 0x00f35c
	* -62300 => 0x80f35c
	*/
	BigInteger.prototype.toByteArraySigned = function () {
		var val = this.abs().toByteArrayUnsigned();
		var neg = this.compareTo(BigInteger.ZERO) < 0;

		if (neg) {
			if (val[0] & 0x80) {
				val.unshift(0x80);
			} else {
				val[0] |= 0x80;
			}
		} else {
			if (val[0] & 0x80) {
				val.unshift(0x00);
			}
		}

		return val;
	};

	/**
	* Parse a signed big integer byte representation.
	*
	* For details on the format please see BigInteger.toByteArraySigned.
	*/
	BigInteger.fromByteArraySigned = function (ba) {
		// Check for negative value
		if (ba[0] & 0x80) {
			// Remove sign bit
			ba[0] &= 0x7f;

			return BigInteger.fromByteArrayUnsigned(ba).negate();
		} else {
			return BigInteger.fromByteArrayUnsigned(ba);
		}
	};
	// Copyright Stephan Thomas (end) --- //




	// ****** REDUCTION ******* //

	// Modular reduction using "classic" algorithm
	function Classic(m) { this.m = m; }
	Classic.prototype.convert = function (x) {
		if (x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
		else return x;
	};
	Classic.prototype.revert = function (x) { return x; };
	Classic.prototype.reduce = function (x) { x.divRemTo(this.m, null, x); };
	Classic.prototype.mulTo = function (x, y, r) { x.multiplyTo(y, r); this.reduce(r); };
	Classic.prototype.sqrTo = function (x, r) { x.squareTo(r); this.reduce(r); };





	// Montgomery reduction
	function Montgomery(m) {
		this.m = m;
		this.mp = m.invDigit();
		this.mpl = this.mp & 0x7fff;
		this.mph = this.mp >> 15;
		this.um = (1 << (m.DB - 15)) - 1;
		this.mt2 = 2 * m.t;
	}
	// xR mod m
	Montgomery.prototype.convert = function (x) {
		var r = nbi();
		x.abs().dlShiftTo(this.m.t, r);
		r.divRemTo(this.m, null, r);
		if (x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r, r);
		return r;
	}
	// x/R mod m
	Montgomery.prototype.revert = function (x) {
		var r = nbi();
		x.copyTo(r);
		this.reduce(r);
		return r;
	};
	// x = x/R mod m (HAC 14.32)
	Montgomery.prototype.reduce = function (x) {
		while (x.t <= this.mt2)	// pad x so am has enough room later
			x[x.t++] = 0;
		for (var i = 0; i < this.m.t; ++i) {
			// faster way of calculating u0 = x[i]*mp mod DV
			var j = x[i] & 0x7fff;
			var u0 = (j * this.mpl + (((j * this.mph + (x[i] >> 15) * this.mpl) & this.um) << 15)) & x.DM;
			// use am to combine the multiply-shift-add into one call
			j = i + this.m.t;
			x[j] += this.m.am(0, u0, x, i, 0, this.m.t);
			// propagate carry
			while (x[j] >= x.DV) { x[j] -= x.DV; x[++j]++; }
		}
		x.clamp();
		x.drShiftTo(this.m.t, x);
		if (x.compareTo(this.m) >= 0) x.subTo(this.m, x);
	};
	// r = "xy/R mod m"; x,y != r
	Montgomery.prototype.mulTo = function (x, y, r) { x.multiplyTo(y, r); this.reduce(r); };
	// r = "x^2/R mod m"; x != r
	Montgomery.prototype.sqrTo = function (x, r) { x.squareTo(r); this.reduce(r); };





	// A "null" reducer
	function NullExp() { }
	NullExp.prototype.convert = function (x) { return x; };
	NullExp.prototype.revert = function (x) { return x; };
	NullExp.prototype.mulTo = function (x, y, r) { x.multiplyTo(y, r); };
	NullExp.prototype.sqrTo = function (x, r) { x.squareTo(r); };





	// Barrett modular reduction
	function Barrett(m) {
		// setup Barrett
		this.r2 = nbi();
		this.q3 = nbi();
		BigInteger.ONE.dlShiftTo(2 * m.t, this.r2);
		this.mu = this.r2.divide(m);
		this.m = m;
	}
	Barrett.prototype.convert = function (x) {
		if (x.s < 0 || x.t > 2 * this.m.t) return x.mod(this.m);
		else if (x.compareTo(this.m) < 0) return x;
		else { var r = nbi(); x.copyTo(r); this.reduce(r); return r; }
	};
	Barrett.prototype.revert = function (x) { return x; };
	// x = x mod m (HAC 14.42)
	Barrett.prototype.reduce = function (x) {
		x.drShiftTo(this.m.t - 1, this.r2);
		if (x.t > this.m.t + 1) { x.t = this.m.t + 1; x.clamp(); }
		this.mu.multiplyUpperTo(this.r2, this.m.t + 1, this.q3);
		this.m.multiplyLowerTo(this.q3, this.m.t + 1, this.r2);
		while (x.compareTo(this.r2) < 0) x.dAddOffset(1, this.m.t + 1);
		x.subTo(this.r2, x);
		while (x.compareTo(this.m) >= 0) x.subTo(this.m, x);
	};
	// r = x*y mod m; x,y != r
	Barrett.prototype.mulTo = function (x, y, r) { x.multiplyTo(y, r); this.reduce(r); };
	// r = x^2 mod m; x != r
	Barrett.prototype.sqrTo = function (x, r) { x.squareTo(r); this.reduce(r); };

})(exports);

var BigInteger = exports.BigInteger;
/*!
* Crypto-JS v2.5.4	Crypto.js
* http://code.google.com/p/crypto-js/
* Copyright (c) 2009-2013, Jeff Mott. All rights reserved.
* http://code.google.com/p/crypto-js/wiki/License
*/

(function (Crypto) {

	var base64map = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

	// Crypto utilities
	var util = Crypto.util = {

		// Bit-wise rotate left
		rotl: function (n, b) {
			return (n << b) | (n >>> (32 - b));
		},

		// Bit-wise rotate right
		rotr: function (n, b) {
			return (n << (32 - b)) | (n >>> b);
		},

		// Swap big-endian to little-endian and vice versa
		endian: function (n) {

			// If number given, swap endian
			if (n.constructor == Number) {
				return util.rotl(n, 8) & 0x00FF00FF |
		    util.rotl(n, 24) & 0xFF00FF00;
			}

			// Else, assume array and swap all items
			for (var i = 0; i < n.length; i++)
				n[i] = util.endian(n[i]);
			return n;

		},

		// Generate an array of any length of random bytes
		randomBytes: function (n) {
			for (var bytes = []; n > 0; n--)
				bytes.push(Math.floor(Math.random() * 256));
			return bytes;
		},

		// Convert a byte array to big-endian 32-bit words
		bytesToWords: function (bytes) {
			for (var words = [], i = 0, b = 0; i < bytes.length; i++, b += 8)
				words[b >>> 5] |= (bytes[i] & 0xFF) << (24 - b % 32);
			return words;
		},

		// Convert big-endian 32-bit words to a byte array
		wordsToBytes: function (words) {
			for (var bytes = [], b = 0; b < words.length * 32; b += 8)
				bytes.push((words[b >>> 5] >>> (24 - b % 32)) & 0xFF);
			return bytes;
		},

		// Convert a byte array to a hex string
		bytesToHex: function (bytes) {
			for (var hex = [], i = 0; i < bytes.length; i++) {
				hex.push((bytes[i] >>> 4).toString(16));
				hex.push((bytes[i] & 0xF).toString(16));
			}
			return hex.join("");
		},

		// Convert a hex string to a byte array
		hexToBytes: function (hex) {
			for (var bytes = [], c = 0; c < hex.length; c += 2)
				bytes.push(parseInt(hex.substr(c, 2), 16));
			return bytes;
		},

		// Convert a byte array to a base-64 string
		bytesToBase64: function (bytes) {
			for (var base64 = [], i = 0; i < bytes.length; i += 3) {
				var triplet = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
				for (var j = 0; j < 4; j++) {
					if (i * 8 + j * 6 <= bytes.length * 8)
						base64.push(base64map.charAt((triplet >>> 6 * (3 - j)) & 0x3F));
					else base64.push("=");
				}
			}

			return base64.join("");
		},

		// Convert a base-64 string to a byte array
		base64ToBytes: function (base64) {
			// Remove non-base-64 characters
			base64 = base64.replace(/[^A-Z0-9+\/]/ig, "");

			for (var bytes = [], i = 0, imod4 = 0; i < base64.length; imod4 = ++i % 4) {
				if (imod4 == 0) continue;
				bytes.push(((base64map.indexOf(base64.charAt(i - 1)) & (Math.pow(2, -2 * imod4 + 8) - 1)) << (imod4 * 2)) |
		        (base64map.indexOf(base64.charAt(i)) >>> (6 - imod4 * 2)));
			}

			return bytes;
		}

	};

	// Crypto character encodings
	var charenc = Crypto.charenc = {};

	// UTF-8 encoding
	var UTF8 = charenc.UTF8 = {

		// Convert a string to a byte array
		stringToBytes: function (str) {
			return Binary.stringToBytes(unescape(encodeURIComponent(str)));
		},

		// Convert a byte array to a string
		bytesToString: function (bytes) {
			return decodeURIComponent(escape(Binary.bytesToString(bytes)));
		}

	};

	// Binary encoding
	var Binary = charenc.Binary = {

		// Convert a string to a byte array
		stringToBytes: function (str) {
			for (var bytes = [], i = 0; i < str.length; i++)
				bytes.push(str.charCodeAt(i) & 0xFF);
			return bytes;
		},

		// Convert a byte array to a string
		bytesToString: function (bytes) {
			for (var str = [], i = 0; i < bytes.length; i++)
				str.push(String.fromCharCode(bytes[i]));
			return str.join("");
		}

	};

})(Crypto);
/*!
* Crypto-JS v2.0.0  RIPEMD-160
* http://code.google.com/p/crypto-js/
* Copyright (c) 2009, Jeff Mott. All rights reserved.
* http://code.google.com/p/crypto-js/wiki/License
*
* A JavaScript implementation of the RIPEMD-160 Algorithm
* Version 2.2 Copyright Jeremy Lin, Paul Johnston 2000 - 2009.
* Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
* Distributed under the BSD License
* See http://pajhome.org.uk/crypt/md5 for details.
* Also http://www.ocf.berkeley.edu/~jjlin/jsotp/
* Ported to Crypto-JS by Stefan Thomas.
*/

(function (Crypto) {
	// Shortcuts
	var C = Crypto,
	util = C.util,
	charenc = C.charenc,
	UTF8 = charenc.UTF8,
	Binary = charenc.Binary;

	// Convert a byte array to little-endian 32-bit words
	util.bytesToLWords = function (bytes) {

		var output = Array(bytes.length >> 2);
		for (var i = 0; i < output.length; i++)
			output[i] = 0;
		for (var i = 0; i < bytes.length * 8; i += 8)
			output[i >> 5] |= (bytes[i / 8] & 0xFF) << (i % 32);
		return output;
	};

	// Convert little-endian 32-bit words to a byte array
	util.lWordsToBytes = function (words) {
		var output = [];
		for (var i = 0; i < words.length * 32; i += 8)
			output.push((words[i >> 5] >>> (i % 32)) & 0xff);
		return output;
	};

	// Public API
	var RIPEMD160 = C.RIPEMD160 = function (message, options) {
		var digestbytes = util.lWordsToBytes(RIPEMD160._rmd160(message));
		return options && options.asBytes ? digestbytes :
			options && options.asString ? Binary.bytesToString(digestbytes) :
			util.bytesToHex(digestbytes);
	};

	// The core
	RIPEMD160._rmd160 = function (message) {
		// Convert to byte array
		if (message.constructor == String) message = UTF8.stringToBytes(message);

		var x = util.bytesToLWords(message),
			len = message.length * 8;

		/* append padding */
		x[len >> 5] |= 0x80 << (len % 32);
		x[(((len + 64) >>> 9) << 4) + 14] = len;

		var h0 = 0x67452301;
		var h1 = 0xefcdab89;
		var h2 = 0x98badcfe;
		var h3 = 0x10325476;
		var h4 = 0xc3d2e1f0;

		for (var i = 0; i < x.length; i += 16) {
			var T;
			var A1 = h0, B1 = h1, C1 = h2, D1 = h3, E1 = h4;
			var A2 = h0, B2 = h1, C2 = h2, D2 = h3, E2 = h4;
			for (var j = 0; j <= 79; ++j) {
				T = safe_add(A1, rmd160_f(j, B1, C1, D1));
				T = safe_add(T, x[i + rmd160_r1[j]]);
				T = safe_add(T, rmd160_K1(j));
				T = safe_add(bit_rol(T, rmd160_s1[j]), E1);
				A1 = E1; E1 = D1; D1 = bit_rol(C1, 10); C1 = B1; B1 = T;
				T = safe_add(A2, rmd160_f(79 - j, B2, C2, D2));
				T = safe_add(T, x[i + rmd160_r2[j]]);
				T = safe_add(T, rmd160_K2(j));
				T = safe_add(bit_rol(T, rmd160_s2[j]), E2);
				A2 = E2; E2 = D2; D2 = bit_rol(C2, 10); C2 = B2; B2 = T;
			}
			T = safe_add(h1, safe_add(C1, D2));
			h1 = safe_add(h2, safe_add(D1, E2));
			h2 = safe_add(h3, safe_add(E1, A2));
			h3 = safe_add(h4, safe_add(A1, B2));
			h4 = safe_add(h0, safe_add(B1, C2));
			h0 = T;
		}
		return [h0, h1, h2, h3, h4];
	}

	function rmd160_f(j, x, y, z) {
		return (0 <= j && j <= 15) ? (x ^ y ^ z) :
			(16 <= j && j <= 31) ? (x & y) | (~x & z) :
			(32 <= j && j <= 47) ? (x | ~y) ^ z :
			(48 <= j && j <= 63) ? (x & z) | (y & ~z) :
			(64 <= j && j <= 79) ? x ^ (y | ~z) :
			"rmd160_f: j out of range";
	}
	function rmd160_K1(j) {
		return (0 <= j && j <= 15) ? 0x00000000 :
			(16 <= j && j <= 31) ? 0x5a827999 :
			(32 <= j && j <= 47) ? 0x6ed9eba1 :
			(48 <= j && j <= 63) ? 0x8f1bbcdc :
			(64 <= j && j <= 79) ? 0xa953fd4e :
			"rmd160_K1: j out of range";
	}
	function rmd160_K2(j) {
		return (0 <= j && j <= 15) ? 0x50a28be6 :
			(16 <= j && j <= 31) ? 0x5c4dd124 :
			(32 <= j && j <= 47) ? 0x6d703ef3 :
			(48 <= j && j <= 63) ? 0x7a6d76e9 :
			(64 <= j && j <= 79) ? 0x00000000 :
			"rmd160_K2: j out of range";
	}
	var rmd160_r1 = [
		0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
		7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
		3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
		1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
		4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13
	];
	var rmd160_r2 = [
		5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
		6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
		15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
		8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
		12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11
	];
	var rmd160_s1 = [
		11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
		7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
		11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
		11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
		9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6
	];
	var rmd160_s2 = [
		8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
		9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
		9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
		15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
		8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11
	];

	/*
	* Add integers, wrapping at 2^32. This uses 16-bit operations internally
	* to work around bugs in some JS interpreters.
	*/
	function safe_add(x, y) {
		var lsw = (x & 0xFFFF) + (y & 0xFFFF);
		var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
		return (msw << 16) | (lsw & 0xFFFF);
	}

	/*
	* Bitwise rotate a 32-bit number to the left.
	*/
	function bit_rol(num, cnt) {
		return (num << cnt) | (num >>> (32 - cnt));
	}
})(Crypto);/*!
* Crypto-JS v2.5.4	SHA256.js
* http://code.google.com/p/crypto-js/
* Copyright (c) 2009-2013, Jeff Mott. All rights reserved.
* http://code.google.com/p/crypto-js/wiki/License
*/
(function (Crypto) {

	// Shortcuts
	var C = Crypto,
		util = C.util,
		charenc = C.charenc,
		UTF8 = charenc.UTF8,
		Binary = charenc.Binary;

	// Constants
	var K = [0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5,
        0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
        0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3,
        0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
        0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC,
        0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
        0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7,
        0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
        0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13,
        0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
        0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3,
        0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
        0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5,
        0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
        0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208,
        0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2];

	// Public API
	var SHA256 = C.SHA256 = function (message, options) {
		var digestbytes = util.wordsToBytes(SHA256._sha256(message));
		return options && options.asBytes ? digestbytes :
	    options && options.asString ? Binary.bytesToString(digestbytes) :
	    util.bytesToHex(digestbytes);
	};

	// The core
	SHA256._sha256 = function (message) {

		// Convert to byte array
		if (message.constructor == String) message = UTF8.stringToBytes(message);
		/* else, assume byte array already */

		var m = util.bytesToWords(message),
		l = message.length * 8,
		H = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
				0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19],
		w = [],
		a, b, c, d, e, f, g, h, i, j,
		t1, t2;

		// Padding
		m[l >> 5] |= 0x80 << (24 - l % 32);
		m[((l + 64 >> 9) << 4) + 15] = l;

		for (var i = 0; i < m.length; i += 16) {

			a = H[0];
			b = H[1];
			c = H[2];
			d = H[3];
			e = H[4];
			f = H[5];
			g = H[6];
			h = H[7];

			for (var j = 0; j < 64; j++) {

				if (j < 16) w[j] = m[j + i];
				else {

					var gamma0x = w[j - 15],
				gamma1x = w[j - 2],
				gamma0 = ((gamma0x << 25) | (gamma0x >>> 7)) ^
				            ((gamma0x << 14) | (gamma0x >>> 18)) ^
				            (gamma0x >>> 3),
				gamma1 = ((gamma1x << 15) | (gamma1x >>> 17)) ^
				            ((gamma1x << 13) | (gamma1x >>> 19)) ^
				            (gamma1x >>> 10);

					w[j] = gamma0 + (w[j - 7] >>> 0) +
				    gamma1 + (w[j - 16] >>> 0);

				}

				var ch = e & f ^ ~e & g,
			maj = a & b ^ a & c ^ b & c,
			sigma0 = ((a << 30) | (a >>> 2)) ^
			            ((a << 19) | (a >>> 13)) ^
			            ((a << 10) | (a >>> 22)),
			sigma1 = ((e << 26) | (e >>> 6)) ^
			            ((e << 21) | (e >>> 11)) ^
			            ((e << 7) | (e >>> 25));


				t1 = (h >>> 0) + sigma1 + ch + (K[j]) + (w[j] >>> 0);
				t2 = sigma0 + maj;

				h = g;
				g = f;
				f = e;
				e = (d + t1) >>> 0;
				d = c;
				c = b;
				b = a;
				a = (t1 + t2) >>> 0;

			}

			H[0] += a;
			H[1] += b;
			H[2] += c;
			H[3] += d;
			H[4] += e;
			H[5] += f;
			H[6] += g;
			H[7] += h;

		}

		return H;

	};

	// Package private blocksize
	SHA256._blocksize = 16;

	SHA256._digestsize = 32;

})(Crypto);//https://raw.github.com/bitcoinjs/bitcoinjs-lib/faa10f0f6a1fff0b9a99fffb9bc30cee33b17212/src/ecdsa.js
/*!
* Basic Javascript Elliptic Curve implementation
* Ported loosely from BouncyCastle's Java EC code
* Only Fp curves implemented for now
* 
* Copyright Tom Wu, bitaddress.org  BSD License.
* http://www-cs-students.stanford.edu/~tjw/jsbn/LICENSE
*/
(function (exports) {

	// Constructor function of Global EllipticCurve object
	var ec = exports.EllipticCurve = function () { };

	// ----------------
	// ECFieldElementFp constructor
	// q instanceof BigInteger
	// x instanceof BigInteger
	ec.FieldElementFp = function (q, x) {
		this.x = x;
		// TODO if(x.compareTo(q) >= 0) error
		this.q = q;
	};

	ec.FieldElementFp.prototype.equals = function (other) {
		if (other == this) return true;
		return (this.q.equals(other.q) && this.x.equals(other.x));
	};

	ec.FieldElementFp.prototype.toBigInteger = function () {
		return this.x;
	};

	ec.FieldElementFp.prototype.negate = function () {
		return new ec.FieldElementFp(this.q, this.x.negate().mod(this.q));
	};

	ec.FieldElementFp.prototype.add = function (b) {
		return new ec.FieldElementFp(this.q, this.x.add(b.toBigInteger()).mod(this.q));
	};

	ec.FieldElementFp.prototype.subtract = function (b) {
		return new ec.FieldElementFp(this.q, this.x.subtract(b.toBigInteger()).mod(this.q));
	};

	ec.FieldElementFp.prototype.multiply = function (b) {
		return new ec.FieldElementFp(this.q, this.x.multiply(b.toBigInteger()).mod(this.q));
	};

	ec.FieldElementFp.prototype.square = function () {
		return new ec.FieldElementFp(this.q, this.x.square().mod(this.q));
	};

	ec.FieldElementFp.prototype.divide = function (b) {
		return new ec.FieldElementFp(this.q, this.x.multiply(b.toBigInteger().modInverse(this.q)).mod(this.q));
	};

	ec.FieldElementFp.prototype.getByteLength = function () {
		return Math.floor((this.toBigInteger().bitLength() + 7) / 8);
	};

	// D.1.4 91
	/**
	* return a sqrt root - the routine verifies that the calculation
	* returns the right value - if none exists it returns null.
	* 
	* Copyright (c) 2000 - 2011 The Legion Of The Bouncy Castle (http://www.bouncycastle.org)
	* Ported to JavaScript by bitaddress.org
	*/
	ec.FieldElementFp.prototype.sqrt = function () {
		throw new Error("this feature is disabled since we don't have a randomness source");
		if (!this.q.testBit(0)) throw new Error("even value of q");

		// p mod 4 == 3
		if (this.q.testBit(1)) {
			// z = g^(u+1) + p, p = 4u + 3
			var z = new ec.FieldElementFp(this.q, this.x.modPow(this.q.shiftRight(2).add(BigInteger.ONE), this.q));
			return z.square().equals(this) ? z : null;
		}

		// p mod 4 == 1
		var qMinusOne = this.q.subtract(BigInteger.ONE);
		var legendreExponent = qMinusOne.shiftRight(1);
		if (!(this.x.modPow(legendreExponent, this.q).equals(BigInteger.ONE))) return null;
		var u = qMinusOne.shiftRight(2);
		var k = u.shiftLeft(1).add(BigInteger.ONE);
		var Q = this.x;
		var fourQ = Q.shiftLeft(2).mod(this.q);
		var U, V;

		do {
			var rand = new SecureRandom();
			var P;
			do {
				P = new BigInteger(this.q.bitLength(), rand);
			}
			while (P.compareTo(this.q) >= 0 || !(P.multiply(P).subtract(fourQ).modPow(legendreExponent, this.q).equals(qMinusOne)));

			var result = ec.FieldElementFp.fastLucasSequence(this.q, P, Q, k);

			U = result[0];
			V = result[1];
			if (V.multiply(V).mod(this.q).equals(fourQ)) {
				// Integer division by 2, mod q
				if (V.testBit(0)) {
					V = V.add(this.q);
				}
				V = V.shiftRight(1);
				return new ec.FieldElementFp(this.q, V);
			}
		}
		while (U.equals(BigInteger.ONE) || U.equals(qMinusOne));

		return null;
	};

	/*
	* Copyright (c) 2000 - 2011 The Legion Of The Bouncy Castle (http://www.bouncycastle.org)
	* Ported to JavaScript by bitaddress.org
	*/
	ec.FieldElementFp.fastLucasSequence = function (p, P, Q, k) {
		// TODO Research and apply "common-multiplicand multiplication here"

		var n = k.bitLength();
		var s = k.getLowestSetBit();
		var Uh = BigInteger.ONE;
		var Vl = BigInteger.TWO;
		var Vh = P;
		var Ql = BigInteger.ONE;
		var Qh = BigInteger.ONE;

		for (var j = n - 1; j >= s + 1; --j) {
			Ql = Ql.multiply(Qh).mod(p);
			if (k.testBit(j)) {
				Qh = Ql.multiply(Q).mod(p);
				Uh = Uh.multiply(Vh).mod(p);
				Vl = Vh.multiply(Vl).subtract(P.multiply(Ql)).mod(p);
				Vh = Vh.multiply(Vh).subtract(Qh.shiftLeft(1)).mod(p);
			}
			else {
				Qh = Ql;
				Uh = Uh.multiply(Vl).subtract(Ql).mod(p);
				Vh = Vh.multiply(Vl).subtract(P.multiply(Ql)).mod(p);
				Vl = Vl.multiply(Vl).subtract(Ql.shiftLeft(1)).mod(p);
			}
		}

		Ql = Ql.multiply(Qh).mod(p);
		Qh = Ql.multiply(Q).mod(p);
		Uh = Uh.multiply(Vl).subtract(Ql).mod(p);
		Vl = Vh.multiply(Vl).subtract(P.multiply(Ql)).mod(p);
		Ql = Ql.multiply(Qh).mod(p);

		for (var j = 1; j <= s; ++j) {
			Uh = Uh.multiply(Vl).mod(p);
			Vl = Vl.multiply(Vl).subtract(Ql.shiftLeft(1)).mod(p);
			Ql = Ql.multiply(Ql).mod(p);
		}

		return [Uh, Vl];
	};

	// ----------------
	// ECPointFp constructor
	ec.PointFp = function (curve, x, y, z, compressed) {
		this.curve = curve;
		this.x = x;
		this.y = y;
		// Projective coordinates: either zinv == null or z * zinv == 1
		// z and zinv are just BigIntegers, not fieldElements
		if (z == null) {
			this.z = BigInteger.ONE;
		}
		else {
			this.z = z;
		}
		this.zinv = null;
		// compression flag
		this.compressed = !!compressed;
	};

	ec.PointFp.prototype.getX = function () {
		if (this.zinv == null) {
			this.zinv = this.z.modInverse(this.curve.q);
		}
		return this.curve.fromBigInteger(this.x.toBigInteger().multiply(this.zinv).mod(this.curve.q));
	};

	ec.PointFp.prototype.getY = function () {
		if (this.zinv == null) {
			this.zinv = this.z.modInverse(this.curve.q);
		}
		return this.curve.fromBigInteger(this.y.toBigInteger().multiply(this.zinv).mod(this.curve.q));
	};

	ec.PointFp.prototype.equals = function (other) {
		if (other == this) return true;
		if (this.isInfinity()) return other.isInfinity();
		if (other.isInfinity()) return this.isInfinity();
		var u, v;
		// u = Y2 * Z1 - Y1 * Z2
		u = other.y.toBigInteger().multiply(this.z).subtract(this.y.toBigInteger().multiply(other.z)).mod(this.curve.q);
		if (!u.equals(BigInteger.ZERO)) return false;
		// v = X2 * Z1 - X1 * Z2
		v = other.x.toBigInteger().multiply(this.z).subtract(this.x.toBigInteger().multiply(other.z)).mod(this.curve.q);
		return v.equals(BigInteger.ZERO);
	};

	ec.PointFp.prototype.isInfinity = function () {
		if ((this.x == null) && (this.y == null)) return true;
		return this.z.equals(BigInteger.ZERO) && !this.y.toBigInteger().equals(BigInteger.ZERO);
	};

	ec.PointFp.prototype.negate = function () {
		return new ec.PointFp(this.curve, this.x, this.y.negate(), this.z);
	};

	ec.PointFp.prototype.add = function (b) {
		if (this.isInfinity()) return b;
		if (b.isInfinity()) return this;

		// u = Y2 * Z1 - Y1 * Z2
		var u = b.y.toBigInteger().multiply(this.z).subtract(this.y.toBigInteger().multiply(b.z)).mod(this.curve.q);
		// v = X2 * Z1 - X1 * Z2
		var v = b.x.toBigInteger().multiply(this.z).subtract(this.x.toBigInteger().multiply(b.z)).mod(this.curve.q);


		if (BigInteger.ZERO.equals(v)) {
			if (BigInteger.ZERO.equals(u)) {
				return this.twice(); // this == b, so double
			}
			return this.curve.getInfinity(); // this = -b, so infinity
		}

		var THREE = new BigInteger("3");
		var x1 = this.x.toBigInteger();
		var y1 = this.y.toBigInteger();
		var x2 = b.x.toBigInteger();
		var y2 = b.y.toBigInteger();

		var v2 = v.square();
		var v3 = v2.multiply(v);
		var x1v2 = x1.multiply(v2);
		var zu2 = u.square().multiply(this.z);

		// x3 = v * (z2 * (z1 * u^2 - 2 * x1 * v^2) - v^3)
		var x3 = zu2.subtract(x1v2.shiftLeft(1)).multiply(b.z).subtract(v3).multiply(v).mod(this.curve.q);
		// y3 = z2 * (3 * x1 * u * v^2 - y1 * v^3 - z1 * u^3) + u * v^3
		var y3 = x1v2.multiply(THREE).multiply(u).subtract(y1.multiply(v3)).subtract(zu2.multiply(u)).multiply(b.z).add(u.multiply(v3)).mod(this.curve.q);
		// z3 = v^3 * z1 * z2
		var z3 = v3.multiply(this.z).multiply(b.z).mod(this.curve.q);

		return new ec.PointFp(this.curve, this.curve.fromBigInteger(x3), this.curve.fromBigInteger(y3), z3);
	};

	ec.PointFp.prototype.twice = function () {
		if (this.isInfinity()) return this;
		if (this.y.toBigInteger().signum() == 0) return this.curve.getInfinity();

		// TODO: optimized handling of constants
		var THREE = new BigInteger("3");
		var x1 = this.x.toBigInteger();
		var y1 = this.y.toBigInteger();

		var y1z1 = y1.multiply(this.z);
		var y1sqz1 = y1z1.multiply(y1).mod(this.curve.q);
		var a = this.curve.a.toBigInteger();

		// w = 3 * x1^2 + a * z1^2
		var w = x1.square().multiply(THREE);
		if (!BigInteger.ZERO.equals(a)) {
			w = w.add(this.z.square().multiply(a));
		}
		w = w.mod(this.curve.q);
		// x3 = 2 * y1 * z1 * (w^2 - 8 * x1 * y1^2 * z1)
		var x3 = w.square().subtract(x1.shiftLeft(3).multiply(y1sqz1)).shiftLeft(1).multiply(y1z1).mod(this.curve.q);
		// y3 = 4 * y1^2 * z1 * (3 * w * x1 - 2 * y1^2 * z1) - w^3
		var y3 = w.multiply(THREE).multiply(x1).subtract(y1sqz1.shiftLeft(1)).shiftLeft(2).multiply(y1sqz1).subtract(w.square().multiply(w)).mod(this.curve.q);
		// z3 = 8 * (y1 * z1)^3
		var z3 = y1z1.square().multiply(y1z1).shiftLeft(3).mod(this.curve.q);

		return new ec.PointFp(this.curve, this.curve.fromBigInteger(x3), this.curve.fromBigInteger(y3), z3);
	};

	// Simple NAF (Non-Adjacent Form) multiplication algorithm
	// TODO: modularize the multiplication algorithm
	ec.PointFp.prototype.multiply = function (k) {
		if (this.isInfinity()) return this;
		if (k.signum() == 0) return this.curve.getInfinity();

		var e = k;
		var h = e.multiply(new BigInteger("3"));

		var neg = this.negate();
		var R = this;

		var i;
		for (i = h.bitLength() - 2; i > 0; --i) {
			R = R.twice();

			var hBit = h.testBit(i);
			var eBit = e.testBit(i);

			if (hBit != eBit) {
				R = R.add(hBit ? this : neg);
			}
		}

		return R;
	};

	// Compute this*j + x*k (simultaneous multiplication)
	ec.PointFp.prototype.multiplyTwo = function (j, x, k) {
		var i;
		if (j.bitLength() > k.bitLength())
			i = j.bitLength() - 1;
		else
			i = k.bitLength() - 1;

		var R = this.curve.getInfinity();
		var both = this.add(x);
		while (i >= 0) {
			R = R.twice();
			if (j.testBit(i)) {
				if (k.testBit(i)) {
					R = R.add(both);
				}
				else {
					R = R.add(this);
				}
			}
			else {
				if (k.testBit(i)) {
					R = R.add(x);
				}
			}
			--i;
		}

		return R;
	};

	// patched by bitaddress.org and Casascius for use with Bitcoin.ECKey
	// patched by coretechs to support compressed public keys
	ec.PointFp.prototype.getEncoded = function (compressed) {
		var x = this.getX().toBigInteger();
		var y = this.getY().toBigInteger();
		var len = 32; // integerToBytes will zero pad if integer is less than 32 bytes. 32 bytes length is required by the Bitcoin protocol.
		var enc = ec.integerToBytes(x, len);

		// when compressed prepend byte depending if y point is even or odd 
		if (compressed) {
			if (y.isEven()) {
				enc.unshift(0x02);
			}
			else {
				enc.unshift(0x03);
			}
		}
		else {
			enc.unshift(0x04);
			enc = enc.concat(ec.integerToBytes(y, len)); // uncompressed public key appends the bytes of the y point
		}
		return enc;
	};

	ec.PointFp.decodeFrom = function (curve, enc) {
		var type = enc[0];
		var dataLen = enc.length - 1;

		// Extract x and y as byte arrays
		var xBa = enc.slice(1, 1 + dataLen / 2);
		var yBa = enc.slice(1 + dataLen / 2, 1 + dataLen);

		// Prepend zero byte to prevent interpretation as negative integer
		xBa.unshift(0);
		yBa.unshift(0);

		// Convert to BigIntegers
		var x = new BigInteger(xBa);
		var y = new BigInteger(yBa);

		// Return point
		return new ec.PointFp(curve, curve.fromBigInteger(x), curve.fromBigInteger(y));
	};

	ec.PointFp.prototype.add2D = function (b) {
		if (this.isInfinity()) return b;
		if (b.isInfinity()) return this;

		if (this.x.equals(b.x)) {
			if (this.y.equals(b.y)) {
				// this = b, i.e. this must be doubled
				return this.twice();
			}
			// this = -b, i.e. the result is the point at infinity
			return this.curve.getInfinity();
		}

		var x_x = b.x.subtract(this.x);
		var y_y = b.y.subtract(this.y);
		var gamma = y_y.divide(x_x);

		var x3 = gamma.square().subtract(this.x).subtract(b.x);
		var y3 = gamma.multiply(this.x.subtract(x3)).subtract(this.y);

		return new ec.PointFp(this.curve, x3, y3);
	};

	ec.PointFp.prototype.twice2D = function () {
		if (this.isInfinity()) return this;
		if (this.y.toBigInteger().signum() == 0) {
			// if y1 == 0, then (x1, y1) == (x1, -y1)
			// and hence this = -this and thus 2(x1, y1) == infinity
			return this.curve.getInfinity();
		}

		var TWO = this.curve.fromBigInteger(BigInteger.valueOf(2));
		var THREE = this.curve.fromBigInteger(BigInteger.valueOf(3));
		var gamma = this.x.square().multiply(THREE).add(this.curve.a).divide(this.y.multiply(TWO));

		var x3 = gamma.square().subtract(this.x.multiply(TWO));
		var y3 = gamma.multiply(this.x.subtract(x3)).subtract(this.y);

		return new ec.PointFp(this.curve, x3, y3);
	};

	ec.PointFp.prototype.multiply2D = function (k) {
		if (this.isInfinity()) return this;
		if (k.signum() == 0) return this.curve.getInfinity();

		var e = k;
		var h = e.multiply(new BigInteger("3"));

		var neg = this.negate();
		var R = this;

		var i;
		for (i = h.bitLength() - 2; i > 0; --i) {
			R = R.twice();

			var hBit = h.testBit(i);
			var eBit = e.testBit(i);

			if (hBit != eBit) {
				R = R.add2D(hBit ? this : neg);
			}
		}

		return R;
	};

	ec.PointFp.prototype.isOnCurve = function () {
		var x = this.getX().toBigInteger();
		var y = this.getY().toBigInteger();
		var a = this.curve.getA().toBigInteger();
		var b = this.curve.getB().toBigInteger();
		var n = this.curve.getQ();
		var lhs = y.multiply(y).mod(n);
		var rhs = x.multiply(x).multiply(x).add(a.multiply(x)).add(b).mod(n);
		return lhs.equals(rhs);
	};

	ec.PointFp.prototype.toString = function () {
		return '(' + this.getX().toBigInteger().toString() + ',' + this.getY().toBigInteger().toString() + ')';
	};

	/**
	* Validate an elliptic curve point.
	*
	* See SEC 1, section 3.2.2.1: Elliptic Curve Public Key Validation Primitive
	*/
	ec.PointFp.prototype.validate = function () {
		var n = this.curve.getQ();

		// Check Q != O
		if (this.isInfinity()) {
			throw new Error("Point is at infinity.");
		}

		// Check coordinate bounds
		var x = this.getX().toBigInteger();
		var y = this.getY().toBigInteger();
		if (x.compareTo(BigInteger.ONE) < 0 || x.compareTo(n.subtract(BigInteger.ONE)) > 0) {
			throw new Error('x coordinate out of bounds');
		}
		if (y.compareTo(BigInteger.ONE) < 0 || y.compareTo(n.subtract(BigInteger.ONE)) > 0) {
			throw new Error('y coordinate out of bounds');
		}

		// Check y^2 = x^3 + ax + b (mod n)
		if (!this.isOnCurve()) {
			throw new Error("Point is not on the curve.");
		}

		// Check nQ = 0 (Q is a scalar multiple of G)
		if (this.multiply(n).isInfinity()) {
			// TODO: This check doesn't work - fix.
			throw new Error("Point is not a scalar multiple of G.");
		}

		return true;
	};




	// ----------------
	// ECCurveFp constructor
	ec.CurveFp = function (q, a, b) {
		this.q = q;
		this.a = this.fromBigInteger(a);
		this.b = this.fromBigInteger(b);
		this.infinity = new ec.PointFp(this, null, null);
	}

	ec.CurveFp.prototype.getQ = function () {
		return this.q;
	};

	ec.CurveFp.prototype.getA = function () {
		return this.a;
	};

	ec.CurveFp.prototype.getB = function () {
		return this.b;
	};

	ec.CurveFp.prototype.equals = function (other) {
		if (other == this) return true;
		return (this.q.equals(other.q) && this.a.equals(other.a) && this.b.equals(other.b));
	};

	ec.CurveFp.prototype.getInfinity = function () {
		return this.infinity;
	};

	ec.CurveFp.prototype.fromBigInteger = function (x) {
		return new ec.FieldElementFp(this.q, x);
	};

	// for now, work with hex strings because they're easier in JS
	// compressed support added by bitaddress.org
	ec.CurveFp.prototype.decodePointHex = function (s) {
		var firstByte = parseInt(s.substr(0, 2), 16);
		switch (firstByte) { // first byte
			case 0:
				return this.infinity;
			case 2: // compressed
			case 3: // compressed
				var yTilde = firstByte & 1;
				var xHex = s.substr(2, s.length - 2);
				var X1 = new BigInteger(xHex, 16);
				return this.decompressPoint(yTilde, X1);
			case 4: // uncompressed
			case 6: // hybrid
			case 7: // hybrid
				var len = (s.length - 2) / 2;
				var xHex = s.substr(2, len);
				var yHex = s.substr(len + 2, len);

				return new ec.PointFp(this,
					this.fromBigInteger(new BigInteger(xHex, 16)),
					this.fromBigInteger(new BigInteger(yHex, 16)));

			default: // unsupported
				return null;
		}
	};

	/*
	* Copyright (c) 2000 - 2011 The Legion Of The Bouncy Castle (http://www.bouncycastle.org)
	* Ported to JavaScript by bitaddress.org
	*
	* Number yTilde
	* BigInteger X1
	*/
	ec.CurveFp.prototype.decompressPoint = function (yTilde, X1) {
		var x = this.fromBigInteger(X1);
		var alpha = x.multiply(x.square().add(this.getA())).add(this.getB());
		var beta = alpha.sqrt();
		// if we can't find a sqrt we haven't got a point on the curve - run!
		if (beta == null) throw new Error("Invalid point compression");
		var betaValue = beta.toBigInteger();
		var bit0 = betaValue.testBit(0) ? 1 : 0;
		if (bit0 != yTilde) {
			// Use the other root
			beta = this.fromBigInteger(this.getQ().subtract(betaValue));
		}
		return new ec.PointFp(this, x, beta, null, true);
	};


	ec.fromHex = function (s) { return new BigInteger(s, 16); };

	ec.integerToBytes = function (i, len) {
		var bytes = i.toByteArrayUnsigned();
		if (len < bytes.length) {
			bytes = bytes.slice(bytes.length - len);
		} else while (len > bytes.length) {
			bytes.unshift(0);
		}
		return bytes;
	};


	// Named EC curves
	// ----------------
	// X9ECParameters constructor
	ec.X9Parameters = function (curve, g, n, h) {
		this.curve = curve;
		this.g = g;
		this.n = n;
		this.h = h;
	}
	ec.X9Parameters.prototype.getCurve = function () { return this.curve; };
	ec.X9Parameters.prototype.getG = function () { return this.g; };
	ec.X9Parameters.prototype.getN = function () { return this.n; };
	ec.X9Parameters.prototype.getH = function () { return this.h; };

	// secp256k1 is the Curve used by Bitcoin
	ec.secNamedCurves = {
		// used by Bitcoin
		"secp256k1": function () {
			// p = 2^256 - 2^32 - 2^9 - 2^8 - 2^7 - 2^6 - 2^4 - 1
			var p = ec.fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F");
			var a = BigInteger.ZERO;
			var b = ec.fromHex("7");
			var n = ec.fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
			var h = BigInteger.ONE;
			var curve = new ec.CurveFp(p, a, b);
			var G = curve.decodePointHex("04"
					+ "79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798"
					+ "483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8");
			return new ec.X9Parameters(curve, G, n, h);
		}
	};

	// secp256k1 called by Bitcoin's ECKEY
	ec.getSECCurveByName = function (name) {
		if (ec.secNamedCurves[name] == undefined) return null;
		return ec.secNamedCurves[name]();
	}
})(exports);

var EllipticCurve = exports.EllipticCurve;//https://raw.github.com/bitcoinjs/bitcoinjs-lib/09e8c6e184d6501a0c2c59d73ca64db5c0d3eb95/src/address.js
// See here for license information: https://github.com/bitcoinjs/bitcoinjs-lib/blob/master/LICENSE
(function (Bitcoin) {
	Bitcoin.Address = function (bytes) {
		if ("string" == typeof bytes) {
			bytes = Bitcoin.Address.decodeString(bytes);
		}
		this.hash = bytes;
		this.version = Bitcoin.Address.networkVersion;
	};

	Bitcoin.Address.networkVersion = 0x00; // mainnet

	/**
	* Serialize this object as a standard Bitcoin address.
	*
	* Returns the address as a base58-encoded string in the standardized format.
	*/
	Bitcoin.Address.prototype.toString = function () {
		// Get a copy of the hash
		var hash = this.hash.slice(0);

		// Version
		hash.unshift(this.version);
		var checksum = Crypto.SHA256(Crypto.SHA256(hash, { asBytes: true }), { asBytes: true });
		var bytes = hash.concat(checksum.slice(0, 4));
		return Bitcoin.Base58.encode(bytes);
	};

	Bitcoin.Address.prototype.getHashBase64 = function () {
		return Crypto.util.bytesToBase64(this.hash);
	};

	/**
	* Parse a Bitcoin address contained in a string.
	*/
	Bitcoin.Address.decodeString = function (string) {
		var bytes = Bitcoin.Base58.decode(string);
		var hash = bytes.slice(0, 21);
		var checksum = Crypto.SHA256(Crypto.SHA256(hash, { asBytes: true }), { asBytes: true });

		if (checksum[0] != bytes[21] ||
				checksum[1] != bytes[22] ||
				checksum[2] != bytes[23] ||
				checksum[3] != bytes[24]) {
			throw "Checksum validation failed!";
		}

		var version = hash.shift();

		if (version != 0) {
			throw "Version " + version + " not supported!";
		}

		return hash;
	};
})(Bitcoin);
//https://raw.github.com/bitcoinjs/bitcoinjs-lib/c952aaeb3ee472e3776655b8ea07299ebed702c7/src/base58.js
// See here for license information: https://github.com/bitcoinjs/bitcoinjs-lib/blob/master/LICENSE
(function (Bitcoin) {
	Bitcoin.Base58 = {
		alphabet: "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
		validRegex: /^[1-9A-HJ-NP-Za-km-z]+$/,
		base: BigInteger.valueOf(58),

		/**
		* Convert a byte array to a base58-encoded string.
		*
		* Written by Mike Hearn for BitcoinJ.
		*   Copyright (c) 2011 Google Inc.
		*
		* Ported to JavaScript by Stefan Thomas.
		*/
		encode: function (input) {
			var bi = BigInteger.fromByteArrayUnsigned(input);
			var chars = [];

			while (bi.compareTo(B58.base) >= 0) {
				var mod = bi.mod(B58.base);
				chars.unshift(B58.alphabet[mod.intValue()]);
				bi = bi.subtract(mod).divide(B58.base);
			}
			chars.unshift(B58.alphabet[bi.intValue()]);

			// Convert leading zeros too.
			for (var i = 0; i < input.length; i++) {
				if (input[i] == 0x00) {
					chars.unshift(B58.alphabet[0]);
				} else break;
			}

			return chars.join('');
		},

		/**
		* Convert a base58-encoded string to a byte array.
		*
		* Written by Mike Hearn for BitcoinJ.
		*   Copyright (c) 2011 Google Inc.
		*
		* Ported to JavaScript by Stefan Thomas.
		*/
		decode: function (input) {
			var bi = BigInteger.valueOf(0);
			var leadingZerosNum = 0;
			for (var i = input.length - 1; i >= 0; i--) {
				var alphaIndex = B58.alphabet.indexOf(input[i]);
				if (alphaIndex < 0) {
					throw "Invalid character";
				}
				bi = bi.add(BigInteger.valueOf(alphaIndex)
								.multiply(B58.base.pow(input.length - 1 - i)));

				// This counts leading zero bytes
				if (input[i] == "1") leadingZerosNum++;
				else leadingZerosNum = 0;
			}
			var bytes = bi.toByteArrayUnsigned();

			// Add leading zeros
			while (leadingZerosNum-- > 0) bytes.unshift(0);

			return bytes;
		}
	};

	var B58 = Bitcoin.Base58;
})(Bitcoin);
//https://raw.github.com/pointbiz/bitcoinjs-lib/9b2f94a028a7bc9bed94e0722563e9ff1d8e8db8/src/eckey.js
// See here for license information: https://github.com/bitcoinjs/bitcoinjs-lib/blob/master/LICENSE
(function (Bitcoin) {
	Bitcoin.ECKey = (function () {
		var ecparams = EllipticCurve.getSECCurveByName("secp256k1");

		var ECKey = function (input) {
			if (input instanceof BigInteger) {
				// Input is a private key value
				this.priv = input;
			} else if (Bitcoin.Util.isArray(input)) {
				// Prepend zero byte to prevent interpretation as negative integer
				this.priv = BigInteger.fromByteArrayUnsigned(input);
			} else if ("string" == typeof input) {
				var bytes = null;
				if (ECKey.isWalletImportFormat(input)) {
					bytes = ECKey.decodeWalletImportFormat(input);
				} else if (ECKey.isCompressedWalletImportFormat(input)) {
					bytes = ECKey.decodeCompressedWalletImportFormat(input);
					this.compressed = true;
				} else if (ECKey.isMiniFormat(input)) {
					bytes = Crypto.SHA256(input, { asBytes: true });
				} else if (ECKey.isHexFormat(input)) {
					bytes = Crypto.util.hexToBytes(input);
				} else if (ECKey.isBase64Format(input)) {
					bytes = Crypto.util.base64ToBytes(input);
				}
				
				if (ECKey.isBase6Format(input)) {
					this.priv = new BigInteger(input, 6);
				} else if (bytes == null || bytes.length != 32) {
					this.priv = null;
				} else {
					// Prepend zero byte to prevent interpretation as negative integer
					this.priv = BigInteger.fromByteArrayUnsigned(bytes);
				}
			} else {
				throw new Error("no plausible constructor behavior");	
			}

			this.compressed = (this.compressed == undefined) ? !!ECKey.compressByDefault : this.compressed;
		};

		ECKey.privateKeyPrefix = 0x80; // mainnet 0x80    testnet 0xEF

		/**
		* Whether public keys should be returned compressed by default.
		*/
		ECKey.compressByDefault = false;

		/**
		* Set whether the public key should be returned compressed or not.
		*/
		ECKey.prototype.setCompressed = function (v) {
			this.compressed = !!v;
			if (this.pubPoint) this.pubPoint.compressed = this.compressed;
			return this;
		};

		/*
		* Return public key as a byte array in DER encoding
		*/
		ECKey.prototype.getPub = function () {
			if (this.compressed) {
				if (this.pubComp) return this.pubComp;
				return this.pubComp = this.getPubPoint().getEncoded(1);
			} else {
				if (this.pubUncomp) return this.pubUncomp;
				return this.pubUncomp = this.getPubPoint().getEncoded(0);
			}
		};

		/**
		* Return public point as ECPoint object.
		*/
		ECKey.prototype.getPubPoint = function () {
			if (!this.pubPoint) {
				this.pubPoint = ecparams.getG().multiply(this.priv);
				this.pubPoint.compressed = this.compressed;
			}
			return this.pubPoint;
		};

		ECKey.prototype.getPubKeyHex = function () {
			if (this.compressed) {
				if (this.pubKeyHexComp) return this.pubKeyHexComp;
				return this.pubKeyHexComp = Crypto.util.bytesToHex(this.getPub()).toString().toUpperCase();
			} else {
				if (this.pubKeyHexUncomp) return this.pubKeyHexUncomp;
				return this.pubKeyHexUncomp = Crypto.util.bytesToHex(this.getPub()).toString().toUpperCase();
			}
		};

		/**
		* Get the pubKeyHash for this key.
		*
		* This is calculated as RIPE160(SHA256([encoded pubkey])) and returned as
		* a byte array.
		*/
		ECKey.prototype.getPubKeyHash = function () {
			if (this.compressed) {
				if (this.pubKeyHashComp) return this.pubKeyHashComp;
				return this.pubKeyHashComp = Bitcoin.Util.sha256ripe160(this.getPub());
			} else {
				if (this.pubKeyHashUncomp) return this.pubKeyHashUncomp;
				return this.pubKeyHashUncomp = Bitcoin.Util.sha256ripe160(this.getPub());
			}
		};

		ECKey.prototype.getBitcoinAddress = function () {
			var hash = this.getPubKeyHash();
			var addr = new Bitcoin.Address(hash);
			return addr.toString();
		};

		/*
		* Takes a public point as a hex string or byte array
		*/
		ECKey.prototype.setPub = function (pub) {
			// byte array
			if (Bitcoin.Util.isArray(pub)) {
				pub = Crypto.util.bytesToHex(pub).toString().toUpperCase();
			}
			var ecPoint = ecparams.getCurve().decodePointHex(pub);
			this.setCompressed(ecPoint.compressed);
			this.pubPoint = ecPoint;
			return this;
		};

		// Sipa Private Key Wallet Import Format 
		ECKey.prototype.getBitcoinWalletImportFormat = function () {
			var bytes = this.getBitcoinPrivateKeyByteArray();
			bytes.unshift(ECKey.privateKeyPrefix); // prepend 0x80 byte
			if (this.compressed) bytes.push(0x01); // append 0x01 byte for compressed format
			var checksum = Crypto.SHA256(Crypto.SHA256(bytes, { asBytes: true }), { asBytes: true });
			bytes = bytes.concat(checksum.slice(0, 4));
			var privWif = Bitcoin.Base58.encode(bytes);
			return privWif;
		};

		// Private Key Hex Format 
		ECKey.prototype.getBitcoinHexFormat = function () {
			return Crypto.util.bytesToHex(this.getBitcoinPrivateKeyByteArray()).toString().toUpperCase();
		};

		// Private Key Base64 Format 
		ECKey.prototype.getBitcoinBase64Format = function () {
			return Crypto.util.bytesToBase64(this.getBitcoinPrivateKeyByteArray());
		};

		ECKey.prototype.getBitcoinPrivateKeyByteArray = function () {
			// Get a copy of private key as a byte array
			var bytes = this.priv.toByteArrayUnsigned();
			// zero pad if private key is less than 32 bytes 
			while (bytes.length < 32) bytes.unshift(0x00);
			return bytes;
		};

		ECKey.prototype.toString = function (format) {
			format = format || "";
			if (format.toString().toLowerCase() == "base64" || format.toString().toLowerCase() == "b64") {
				return this.getBitcoinBase64Format();
			}
			// Wallet Import Format
			else if (format.toString().toLowerCase() == "wif") {
				return this.getBitcoinWalletImportFormat();
			}
			else {
				return this.getBitcoinHexFormat();
			}
		};

		/**
		* Parse a wallet import format private key contained in a string.
		*/
		ECKey.decodeWalletImportFormat = function (privStr) {
			var bytes = Bitcoin.Base58.decode(privStr);
			var hash = bytes.slice(0, 33);
			var checksum = Crypto.SHA256(Crypto.SHA256(hash, { asBytes: true }), { asBytes: true });
			if (checksum[0] != bytes[33] ||
						checksum[1] != bytes[34] ||
						checksum[2] != bytes[35] ||
						checksum[3] != bytes[36]) {
				throw "Checksum validation failed!";
			}
			var version = hash.shift();
			if (version != ECKey.privateKeyPrefix) {
				throw "Version " + version + " not supported!";
			}
			return hash;
		};

		/**
		* Parse a compressed wallet import format private key contained in a string.
		*/
		ECKey.decodeCompressedWalletImportFormat = function (privStr) {
			var bytes = Bitcoin.Base58.decode(privStr);
			var hash = bytes.slice(0, 34);
			var checksum = Crypto.SHA256(Crypto.SHA256(hash, { asBytes: true }), { asBytes: true });
			if (checksum[0] != bytes[34] ||
						checksum[1] != bytes[35] ||
						checksum[2] != bytes[36] ||
						checksum[3] != bytes[37]) {
				throw "Checksum validation failed!";
			}
			var version = hash.shift();
			if (version != ECKey.privateKeyPrefix) {
				throw "Version " + version + " not supported!";
			}
			hash.pop();
			return hash;
		};

		// 64 characters [0-9A-F]
		ECKey.isHexFormat = function (key) {
			key = key.toString();
			return /^[A-Fa-f0-9]{64}$/.test(key);
		};

		// 51 characters base58, always starts with a '5'
		ECKey.isWalletImportFormat = function (key) {
			key = key.toString();
			return (ECKey.privateKeyPrefix == 0x80) ?
								(/^5[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{50}$/.test(key)) :
								(/^9[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{50}$/.test(key));
		};

		// 52 characters base58
		ECKey.isCompressedWalletImportFormat = function (key) {
			key = key.toString();
			return (ECKey.privateKeyPrefix == 0x80) ?
								(/^[LK][123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{51}$/.test(key)) :
								(/^c[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{51}$/.test(key));
		};

		// 44 characters
		ECKey.isBase64Format = function (key) {
			key = key.toString();
			return (/^[ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789=+\/]{44}$/.test(key));
		};

		// 99 characters, 1=1, if using dice convert 6 to 0
		ECKey.isBase6Format = function (key) {
			key = key.toString();
			return (/^[012345]{99}$/.test(key));
		};

		// 22, 26 or 30 characters, always starts with an 'S'
		ECKey.isMiniFormat = function (key) {
			key = key.toString();
			var validChars22 = /^S[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{21}$/.test(key);
			var validChars26 = /^S[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{25}$/.test(key);
			var validChars30 = /^S[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{29}$/.test(key);
			var testBytes = Crypto.SHA256(key + "?", { asBytes: true });

			return ((testBytes[0] === 0x00 || testBytes[0] === 0x01) && (validChars22 || validChars26 || validChars30));
		};

		return ECKey;
	})();
})(Bitcoin);//https://raw.github.com/bitcoinjs/bitcoinjs-lib/09e8c6e184d6501a0c2c59d73ca64db5c0d3eb95/src/util.js
// See here for license information: https://github.com/bitcoinjs/bitcoinjs-lib/blob/master/LICENSE
// Bitcoin utility functions
(function (Bitcoin) {
	Bitcoin.Util = {
		/**
		* Cross-browser compatibility version of Array.isArray.
		*/
		isArray: Array.isArray || function (o) {
			return Object.prototype.toString.call(o) === '[object Array]';
		},
		/**
		* Create an array of a certain length filled with a specific value.
		*/
		makeFilledArray: function (len, val) {
			var array = [];
			var i = 0;
			while (i < len) {
				array[i++] = val;
			}
			return array;
		},
		/**
		* Turn an integer into a "var_int".
		*
		* "var_int" is a variable length integer used by Bitcoin's binary format.
		*
		* Returns a byte array.
		*/
		numToVarInt: function (i) {
			if (i < 0xfd) {
				// unsigned char
				return [i];
			} else if (i <= 1 << 16) {
				// unsigned short (LE)
				return [0xfd, i >>> 8, i & 255];
			} else if (i <= 1 << 32) {
				// unsigned int (LE)
				return [0xfe].concat(Crypto.util.wordsToBytes([i]));
			} else {
				// unsigned long long (LE)
				return [0xff].concat(Crypto.util.wordsToBytes([i >>> 32, i]));
			}
		},
		/**
		* Parse a Bitcoin value byte array, returning a BigInteger.
		*/
		valueToBigInt: function (valueBuffer) {
			if (valueBuffer instanceof BigInteger) return valueBuffer;

			// Prepend zero byte to prevent interpretation as negative integer
			return BigInteger.fromByteArrayUnsigned(valueBuffer);
		},
		/**
		* Format a Bitcoin value as a string.
		*
		* Takes a BigInteger or byte-array and returns that amount of Bitcoins in a
		* nice standard formatting.
		*
		* Examples:
		* 12.3555
		* 0.1234
		* 900.99998888
		* 34.00
		*/
		formatValue: function (valueBuffer) {
			var value = this.valueToBigInt(valueBuffer).toString();
			var integerPart = value.length > 8 ? value.substr(0, value.length - 8) : '0';
			var decimalPart = value.length > 8 ? value.substr(value.length - 8) : value;
			while (decimalPart.length < 8) decimalPart = "0" + decimalPart;
			decimalPart = decimalPart.replace(/0*$/, '');
			while (decimalPart.length < 2) decimalPart += "0";
			return integerPart + "." + decimalPart;
		},
		/**
		* Parse a floating point string as a Bitcoin value.
		*
		* Keep in mind that parsing user input is messy. You should always display
		* the parsed value back to the user to make sure we understood his input
		* correctly.
		*/
		parseValue: function (valueString) {
			// TODO: Detect other number formats (e.g. comma as decimal separator)
			var valueComp = valueString.split('.');
			var integralPart = valueComp[0];
			var fractionalPart = valueComp[1] || "0";
			while (fractionalPart.length < 8) fractionalPart += "0";
			fractionalPart = fractionalPart.replace(/^0+/g, '');
			var value = BigInteger.valueOf(parseInt(integralPart));
			value = value.multiply(BigInteger.valueOf(100000000));
			value = value.add(BigInteger.valueOf(parseInt(fractionalPart)));
			return value;
		},
		/**
		* Calculate RIPEMD160(SHA256(data)).
		*
		* Takes an arbitrary byte array as inputs and returns the hash as a byte
		* array.
		*/
		sha256ripe160: function (data) {
			return Crypto.RIPEMD160(Crypto.SHA256(data, { asBytes: true }), { asBytes: true });
		},
		// double sha256
		dsha256: function (data) {
			return Crypto.SHA256(Crypto.SHA256(data, { asBytes: true }), { asBytes: true });
		}
	};
})(Bitcoin);
},{}],17:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var AES, BlockCipher, G, Global, scrub_vec,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };



  BlockCipher = require('./algbase').BlockCipher;

  scrub_vec = require('./util').scrub_vec;

  Global = (function() {
    function Global() {
      var i;
      this.SBOX = [];
      this.INV_SBOX = [];
      this.SUB_MIX = (function() {
        var _i, _results;
        _results = [];
        for (i = _i = 0; _i < 4; i = ++_i) {
          _results.push([]);
        }
        return _results;
      })();
      this.INV_SUB_MIX = (function() {
        var _i, _results;
        _results = [];
        for (i = _i = 0; _i < 4; i = ++_i) {
          _results.push([]);
        }
        return _results;
      })();
      this.init();
      this.RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
    }

    Global.prototype.init = function() {
      var d, i, sx, t, x, x2, x4, x8, xi, _i;
      d = (function() {
        var _i, _results;
        _results = [];
        for (i = _i = 0; _i < 256; i = ++_i) {
          if (i < 128) {
            _results.push(i << 1);
          } else {
            _results.push((i << 1) ^ 0x11b);
          }
        }
        return _results;
      })();
      x = 0;
      xi = 0;
      for (i = _i = 0; _i < 256; i = ++_i) {
        sx = xi ^ (xi << 1) ^ (xi << 2) ^ (xi << 3) ^ (xi << 4);
        sx = (sx >>> 8) ^ (sx & 0xff) ^ 0x63;
        this.SBOX[x] = sx;
        this.INV_SBOX[sx] = x;
        x2 = d[x];
        x4 = d[x2];
        x8 = d[x4];
        t = (d[sx] * 0x101) ^ (sx * 0x1010100);
        this.SUB_MIX[0][x] = (t << 24) | (t >>> 8);
        this.SUB_MIX[1][x] = (t << 16) | (t >>> 16);
        this.SUB_MIX[2][x] = (t << 8) | (t >>> 24);
        this.SUB_MIX[3][x] = t;
        t = (x8 * 0x1010101) ^ (x4 * 0x10001) ^ (x2 * 0x101) ^ (x * 0x1010100);
        this.INV_SUB_MIX[0][sx] = (t << 24) | (t >>> 8);
        this.INV_SUB_MIX[1][sx] = (t << 16) | (t >>> 16);
        this.INV_SUB_MIX[2][sx] = (t << 8) | (t >>> 24);
        this.INV_SUB_MIX[3][sx] = t;
        if (x === 0) {
          x = xi = 1;
        } else {
          x = x2 ^ d[d[d[x8 ^ x2]]];
          xi ^= d[d[xi]];
        }
      }
      return true;
    };

    return Global;

  })();

  G = new Global();

  AES = (function(_super) {
    __extends(AES, _super);

    AES.blockSize = 4 * 4;

    AES.prototype.blockSize = AES.blockSize;

    AES.keySize = 256 / 8;

    AES.prototype.keySize = AES.keySize;

    AES.ivSize = AES.blockSize;

    AES.prototype.ivSize = AES.ivSize;

    function AES(key) {
      this._key = key.clone();
      this._doReset();
    }

    AES.prototype._doReset = function() {
      var invKsRow, keySize, keyWords, ksRow, ksRows, t, _i, _j;
      keyWords = this._key.words;
      keySize = this._key.sigBytes / 4;
      this._nRounds = keySize + 6;
      ksRows = (this._nRounds + 1) * 4;
      this._keySchedule = [];
      for (ksRow = _i = 0; 0 <= ksRows ? _i < ksRows : _i > ksRows; ksRow = 0 <= ksRows ? ++_i : --_i) {
        this._keySchedule[ksRow] = ksRow < keySize ? keyWords[ksRow] : (t = this._keySchedule[ksRow - 1], (ksRow % keySize) === 0 ? (t = (t << 8) | (t >>> 24), t = (G.SBOX[t >>> 24] << 24) | (G.SBOX[(t >>> 16) & 0xff] << 16) | (G.SBOX[(t >>> 8) & 0xff] << 8) | G.SBOX[t & 0xff], t ^= G.RCON[(ksRow / keySize) | 0] << 24) : keySize > 6 && ksRow % keySize === 4 ? t = (G.SBOX[t >>> 24] << 24) | (G.SBOX[(t >>> 16) & 0xff] << 16) | (G.SBOX[(t >>> 8) & 0xff] << 8) | G.SBOX[t & 0xff] : void 0, this._keySchedule[ksRow - keySize] ^ t);
      }
      this._invKeySchedule = [];
      for (invKsRow = _j = 0; 0 <= ksRows ? _j < ksRows : _j > ksRows; invKsRow = 0 <= ksRows ? ++_j : --_j) {
        ksRow = ksRows - invKsRow;
        t = this._keySchedule[ksRow - (invKsRow % 4 ? 0 : 4)];
        this._invKeySchedule[invKsRow] = invKsRow < 4 || ksRow <= 4 ? t : G.INV_SUB_MIX[0][G.SBOX[t >>> 24]] ^ G.INV_SUB_MIX[1][G.SBOX[(t >>> 16) & 0xff]] ^ G.INV_SUB_MIX[2][G.SBOX[(t >>> 8) & 0xff]] ^ G.INV_SUB_MIX[3][G.SBOX[t & 0xff]];
      }
      return true;
    };

    AES.prototype.encryptBlock = function(M, offset) {
      if (offset == null) {
        offset = 0;
      }
      return this._doCryptBlock(M, offset, this._keySchedule, G.SUB_MIX, G.SBOX);
    };

    AES.prototype.decryptBlock = function(M, offset) {
      var _ref, _ref1;
      if (offset == null) {
        offset = 0;
      }
      _ref = [M[offset + 3], M[offset + 1]], M[offset + 1] = _ref[0], M[offset + 3] = _ref[1];
      this._doCryptBlock(M, offset, this._invKeySchedule, G.INV_SUB_MIX, G.INV_SBOX);
      return _ref1 = [M[offset + 3], M[offset + 1]], M[offset + 1] = _ref1[0], M[offset + 3] = _ref1[1], _ref1;
    };

    AES.prototype.scrub = function() {
      scrub_vec(this._keySchedule);
      scrub_vec(this._invKeySchedule);
      return this._key.scrub();
    };

    AES.prototype._doCryptBlock = function(M, offset, keySchedule, SUB_MIX, SBOX) {
      var ksRow, round, s0, s1, s2, s3, t0, t1, t2, t3, _i, _ref;
      s0 = M[offset] ^ keySchedule[0];
      s1 = M[offset + 1] ^ keySchedule[1];
      s2 = M[offset + 2] ^ keySchedule[2];
      s3 = M[offset + 3] ^ keySchedule[3];
      ksRow = 4;
      for (round = _i = 1, _ref = this._nRounds; 1 <= _ref ? _i < _ref : _i > _ref; round = 1 <= _ref ? ++_i : --_i) {
        t0 = SUB_MIX[0][s0 >>> 24] ^ SUB_MIX[1][(s1 >>> 16) & 0xff] ^ SUB_MIX[2][(s2 >>> 8) & 0xff] ^ SUB_MIX[3][s3 & 0xff] ^ keySchedule[ksRow++];
        t1 = SUB_MIX[0][s1 >>> 24] ^ SUB_MIX[1][(s2 >>> 16) & 0xff] ^ SUB_MIX[2][(s3 >>> 8) & 0xff] ^ SUB_MIX[3][s0 & 0xff] ^ keySchedule[ksRow++];
        t2 = SUB_MIX[0][s2 >>> 24] ^ SUB_MIX[1][(s3 >>> 16) & 0xff] ^ SUB_MIX[2][(s0 >>> 8) & 0xff] ^ SUB_MIX[3][s1 & 0xff] ^ keySchedule[ksRow++];
        t3 = SUB_MIX[0][s3 >>> 24] ^ SUB_MIX[1][(s0 >>> 16) & 0xff] ^ SUB_MIX[2][(s1 >>> 8) & 0xff] ^ SUB_MIX[3][s2 & 0xff] ^ keySchedule[ksRow++];
        s0 = t0;
        s1 = t1;
        s2 = t2;
        s3 = t3;
      }
      t0 = ((SBOX[s0 >>> 24] << 24) | (SBOX[(s1 >>> 16) & 0xff] << 16) | (SBOX[(s2 >>> 8) & 0xff] << 8) | SBOX[s3 & 0xff]) ^ keySchedule[ksRow++];
      t1 = ((SBOX[s1 >>> 24] << 24) | (SBOX[(s2 >>> 16) & 0xff] << 16) | (SBOX[(s3 >>> 8) & 0xff] << 8) | SBOX[s0 & 0xff]) ^ keySchedule[ksRow++];
      t2 = ((SBOX[s2 >>> 24] << 24) | (SBOX[(s3 >>> 16) & 0xff] << 16) | (SBOX[(s0 >>> 8) & 0xff] << 8) | SBOX[s1 & 0xff]) ^ keySchedule[ksRow++];
      t3 = ((SBOX[s3 >>> 24] << 24) | (SBOX[(s0 >>> 16) & 0xff] << 16) | (SBOX[(s1 >>> 8) & 0xff] << 8) | SBOX[s2 & 0xff]) ^ keySchedule[ksRow++];
      M[offset] = t0;
      M[offset + 1] = t1;
      M[offset + 2] = t2;
      return M[offset + 3] = t3;
    };

    return AES;

  })(BlockCipher);

  exports.AES = AES;

}).call(this);

},{"./algbase":18,"./util":37}],18:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var BlockCipher, BufferedBlockAlgorithm, Hasher, StreamCipher, WordArray, util,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };



  WordArray = require('./wordarray').WordArray;

  util = require('./util');

  BufferedBlockAlgorithm = (function() {
    BufferedBlockAlgorithm.prototype._minBufferSize = 0;

    function BufferedBlockAlgorithm() {
      this.reset();
    }

    BufferedBlockAlgorithm.prototype.reset = function() {
      this._data = new WordArray();
      return this._nDataBytes = 0;
    };

    BufferedBlockAlgorithm.prototype._append = function(data) {
      this._data.concat(data);
      return this._nDataBytes += data.sigBytes;
    };

    BufferedBlockAlgorithm.prototype._process = function(doFlush) {
      var blockSizeBytes, data, dataSigBytes, dataWords, nBlocksReady, nBytesReady, nWordsReady, offset, processedWords, _i, _ref;
      data = this._data;
      dataWords = data.words;
      dataSigBytes = data.sigBytes;
      blockSizeBytes = this.blockSize * 4;
      nBlocksReady = dataSigBytes / blockSizeBytes;
      if (doFlush) {
        nBlocksReady = Math.ceil(nBlocksReady);
      } else {
        nBlocksReady = Math.max((nBlocksReady | 0) - this._minBufferSize, 0);
      }
      nWordsReady = nBlocksReady * this.blockSize;
      nBytesReady = Math.min(nWordsReady * 4, dataSigBytes);
      if (nWordsReady) {
        for (offset = _i = 0, _ref = this.blockSize; _ref > 0 ? _i < nWordsReady : _i > nWordsReady; offset = _i += _ref) {
          this._doProcessBlock(dataWords, offset);
        }
        processedWords = dataWords.splice(0, nWordsReady);
        data.sigBytes -= nBytesReady;
      }
      return new WordArray(processedWords, nBytesReady);
    };

    BufferedBlockAlgorithm.prototype.copy_to = function(out) {
      out._data = this._data.clone();
      return out._nDataBytes = this._nDataBytes;
    };

    BufferedBlockAlgorithm.prototype.clone = function() {
      var obj;
      obj = new BufferedBlockAlgorithm();
      this.copy_to(obj);
      return obj;
    };

    return BufferedBlockAlgorithm;

  })();

  Hasher = (function(_super) {
    __extends(Hasher, _super);

    function Hasher() {
      Hasher.__super__.constructor.call(this);
    }

    Hasher.prototype.reset = function() {
      Hasher.__super__.reset.call(this);
      this._doReset();
      return this;
    };

    Hasher.prototype.update = function(messageUpdate) {
      this._append(messageUpdate);
      this._process();
      return this;
    };

    Hasher.prototype.finalize = function(messageUpdate) {
      if (messageUpdate) {
        this._append(messageUpdate);
      }
      return this._doFinalize();
    };

    Hasher.prototype.bufhash = function(input) {
      var out, wa_in, wa_out;
      wa_in = WordArray.from_buffer(input);
      wa_out = this.finalize(wa_in);
      out = wa_out.to_buffer();
      wa_in.scrub();
      wa_out.scrub();
      return out;
    };

    return Hasher;

  })(BufferedBlockAlgorithm);

  exports.BlockCipher = BlockCipher = (function() {
    function BlockCipher(key) {}

    BlockCipher.prototype.encryptBlock = function(M, offset) {};

    return BlockCipher;

  })();

  StreamCipher = (function() {
    function StreamCipher() {}

    StreamCipher.prototype.encryptBlock = function(word_array, dst_offset) {
      var n_words, pad;
      if (dst_offset == null) {
        dst_offset = 0;
      }
      pad = this.get_pad();
      n_words = Math.min(word_array.words.length - dst_offset, this.bsiw);
      word_array.xor(pad, {
        dst_offset: dst_offset,
        n_words: n_words
      });
      pad.scrub();
      return this.bsiw;
    };

    StreamCipher.prototype.encrypt = function(word_array) {
      var i, _i, _ref, _ref1;
      for (i = _i = 0, _ref = word_array.words.length, _ref1 = this.bsiw; _ref1 > 0 ? _i < _ref : _i > _ref; i = _i += _ref1) {
        this.encryptBlock(word_array, i);
      }
      return word_array;
    };

    StreamCipher.prototype.bulk_encrypt = function(_arg, cb) {
      var async_args, input, progress_hook, slice_args, what,
        _this = this;
      input = _arg.input, progress_hook = _arg.progress_hook, what = _arg.what;
      slice_args = {
        update: function(lo, hi) {
          var i, _i, _ref, _results;
          _results = [];
          for (i = _i = lo, _ref = _this.bsiw; _ref > 0 ? _i < hi : _i > hi; i = _i += _ref) {
            _results.push(_this.encryptBlock(input, i));
          }
          return _results;
        },
        finalize: function() {
          return input;
        },
        default_n: this.bsiw * 1024
      };
      async_args = {
        progress_hook: progress_hook,
        cb: cb,
        what: what
      };
      return util.bulk(input.sigBytes, slice_args, async_args);
    };

    return StreamCipher;

  })();

  exports.BlockCipher = BlockCipher;

  exports.Hasher = Hasher;

  exports.BufferedBlockAlgorithm = BufferedBlockAlgorithm;

  exports.StreamCipher = StreamCipher;

}).call(this);

},{"./util":37,"./wordarray":38}],19:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var CombineBase, Concat, HMAC, SHA3, SHA512, WordArray, XOR, bulk_sign, _ref,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };



  _ref = require('./hmac'), HMAC = _ref.HMAC, bulk_sign = _ref.bulk_sign;

  SHA512 = require('./sha512').SHA512;

  SHA3 = require('./sha3').SHA3;

  WordArray = require('./wordarray').WordArray;

  CombineBase = (function() {
    function CombineBase() {
      this.hasherBlockSize = this.hashers[0].hasherBlockSize;
      this.hasherBlockSizeBytes = this.hasherBlockSize * 4;
      this.reset();
    }

    CombineBase.prototype.reset = function() {
      var h, _i, _len, _ref1;
      _ref1 = this.hashers;
      for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
        h = _ref1[_i];
        h.reset();
      }
      return this;
    };

    CombineBase.prototype.update = function(w) {
      var h, _i, _len, _ref1;
      _ref1 = this.hashers;
      for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
        h = _ref1[_i];
        h.update(w);
      }
      return this;
    };

    CombineBase.prototype.scrub = function() {
      var h, _i, _len, _ref1;
      _ref1 = this.hashers;
      for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
        h = _ref1[_i];
        h.scrub();
      }
      return this;
    };

    CombineBase.prototype.finalize = function(w) {
      var h, hashes, out, _i, _len, _ref1;
      hashes = (function() {
        var _i, _len, _ref1, _results;
        _ref1 = this.hashers;
        _results = [];
        for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
          h = _ref1[_i];
          _results.push(h.finalize(w));
        }
        return _results;
      }).call(this);
      out = hashes[0];
      _ref1 = hashes.slice(1);
      for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
        h = _ref1[_i];
        this._coalesce(out, h);
        h.scrub();
      }
      return out;
    };

    return CombineBase;

  })();

  Concat = (function(_super) {
    __extends(Concat, _super);

    function Concat(key, klasses) {
      var hm, i, klass, subkey, subkeys;
      if (klasses == null) {
        klasses = [SHA512, SHA3];
      }
      subkeys = key.split(klasses.length);
      this.hashers = (function() {
        var _i, _len, _results;
        _results = [];
        for (i = _i = 0, _len = klasses.length; _i < _len; i = ++_i) {
          klass = klasses[i];
          subkey = subkeys[i];
          hm = new HMAC(subkey, klass);
          subkey.scrub();
          _results.push(hm);
        }
        return _results;
      })();
      Concat.__super__.constructor.call(this);
    }

    Concat.get_output_size = function() {
      return SHA512.output_size + SHA3.output_size;
    };

    Concat.prototype._coalesce = function(out, h) {
      return out.concat(h);
    };

    Concat.prototype.get_output_size = function() {
      var h, tot, _i, _len, _ref1;
      tot = 0;
      _ref1 = this.hashers;
      for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
        h = _ref1[_i];
        tot += h.get_output_size();
      }
      return tot;
    };

    Concat.sign = function(_arg) {
      var input, key;
      key = _arg.key, input = _arg.input;
      return (new Concat(key)).finalize(input);
    };

    Concat.bulk_sign = function(args, cb) {
      args.klass = Concat;
      args.what = "HMAC-SHA512-SHA3";
      return bulk_sign(args, cb);
    };

    return Concat;

  })(CombineBase);

  XOR = (function(_super) {
    __extends(XOR, _super);

    function XOR(key, klasses) {
      var klass;
      if (klasses == null) {
        klasses = [SHA512, SHA3];
      }
      this.hashers = (function() {
        var _i, _len, _results;
        _results = [];
        for (_i = 0, _len = klasses.length; _i < _len; _i++) {
          klass = klasses[_i];
          _results.push(new HMAC(key, klass));
        }
        return _results;
      })();
      XOR.__super__.constructor.call(this);
    }

    XOR.prototype.reset = function() {
      var h, i, _i, _len, _ref1;
      XOR.__super__.reset.call(this);
      _ref1 = this.hashers;
      for (i = _i = 0, _len = _ref1.length; _i < _len; i = ++_i) {
        h = _ref1[i];
        h.update(new WordArray([i]));
      }
      return this;
    };

    XOR.get_output_size = function() {
      return Math.max(SHA512.output_size, SHA3.output_size);
    };

    XOR.prototype._coalesce = function(out, h) {
      return out.xor(h, {});
    };

    XOR.prototype.get_output_size = function() {
      var h;
      return Math.max.apply(Math, (function() {
        var _i, _len, _ref1, _results;
        _ref1 = this.hashers;
        _results = [];
        for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
          h = _ref1[_i];
          _results.push(h.get_output_size());
        }
        return _results;
      }).call(this));
    };

    XOR.sign = function(_arg) {
      var input, key;
      key = _arg.key, input = _arg.input;
      return (new XOR(key)).finalize(input);
    };

    XOR.bulk_sign = function(arg, cb) {
      arg.klass = XOR;
      arg.what = "HMAC-SHA512-XOR-SHA3";
      return bulk_sign(arg, cb);
    };

    return XOR;

  })(CombineBase);

  exports.Concat = Concat;

  exports.XOR = XOR;

}).call(this);

},{"./hmac":24,"./sha3":34,"./sha512":35,"./wordarray":38}],20:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var Cipher, Counter, StreamCipher, WordArray, bulk_encrypt, encrypt, iced, __iced_k, __iced_k_noop,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  iced = require('iced-coffee-script/lib/coffee-script/iced').runtime;
  __iced_k = __iced_k_noop = function() {};

  WordArray = require('./wordarray').WordArray;

  StreamCipher = require('./algbase').StreamCipher;

  Counter = (function() {
    Counter.prototype.WORD_MAX = 0xffffffff;

    function Counter(_arg) {
      var i, len, value;
      value = _arg.value, len = _arg.len;
      this._value = value != null ? value.clone() : (len == null ? len = 2 : void 0, new WordArray((function() {
        var _i, _results;
        _results = [];
        for (i = _i = 0; 0 <= len ? _i < len : _i > len; i = 0 <= len ? ++_i : --_i) {
          _results.push(0);
        }
        return _results;
      })()));
    }

    Counter.prototype.inc = function() {
      var go, i;
      go = true;
      i = this._value.words.length - 1;
      while (go && i >= 0) {
        if ((++this._value.words[i]) > Counter.WORD_MAX) {
          this._value.words[i] = 0;
        } else {
          go = false;
        }
        i--;
      }
      return this;
    };

    Counter.prototype.inc_le = function() {
      var go, i;
      go = true;
      i = 0;
      while (go && i < this._value.words.length) {
        if ((++this._value.words[i]) > Counter.WORD_MAX) {
          this._value.words[i] = 0;
        } else {
          go = false;
        }
        i++;
      }
      return this;
    };

    Counter.prototype.get = function() {
      return this._value;
    };

    Counter.prototype.copy = function() {
      return this._value.clone();
    };

    return Counter;

  })();

  Cipher = (function(_super) {
    __extends(Cipher, _super);

    function Cipher(_arg) {
      this.block_cipher = _arg.block_cipher, this.iv = _arg.iv;
      Cipher.__super__.constructor.call(this);
      this.bsiw = this.block_cipher.blockSize / 4;
      if (!(this.iv.sigBytes === this.block_cipher.blockSize)) {
        throw new Error("IV is wrong length (" + this.iv.sigBytes + ")");
      }
      this.ctr = new Counter({
        value: this.iv
      });
    }

    Cipher.prototype.scrub = function() {
      return this.block_cipher.scrub();
    };

    Cipher.prototype.get_pad = function() {
      var pad;
      pad = this.ctr.copy();
      this.ctr.inc();
      this.block_cipher.encryptBlock(pad.words);
      return pad;
    };

    return Cipher;

  })(StreamCipher);

  encrypt = function(_arg) {
    var block_cipher, cipher, input, iv, ret;
    block_cipher = _arg.block_cipher, iv = _arg.iv, input = _arg.input;
    cipher = new Cipher({
      block_cipher: block_cipher,
      iv: iv
    });
    ret = cipher.encrypt(input);
    cipher.scrub();
    return ret;
  };

  bulk_encrypt = function(_arg, cb) {
    var block_cipher, cipher, input, iv, progress_hook, ret, what, ___iced_passed_deferral, __iced_deferrals, __iced_k,
      _this = this;
    __iced_k = __iced_k_noop;
    ___iced_passed_deferral = iced.findDeferral(arguments);
    block_cipher = _arg.block_cipher, iv = _arg.iv, input = _arg.input, progress_hook = _arg.progress_hook, what = _arg.what;
    cipher = new Cipher({
      block_cipher: block_cipher,
      iv: iv
    });
    (function(__iced_k) {
      __iced_deferrals = new iced.Deferrals(__iced_k, {
        parent: ___iced_passed_deferral,
        filename: "src/ctr.iced",
        funcname: "bulk_encrypt"
      });
      cipher.bulk_encrypt({
        input: input,
        progress_hook: progress_hook,
        what: what
      }, __iced_deferrals.defer({
        assign_fn: (function() {
          return function() {
            return ret = arguments[0];
          };
        })(),
        lineno: 121
      }));
      __iced_deferrals._fulfill();
    })(function() {
      return cb(ret);
    });
  };

  exports.Counter = Counter;

  exports.Cipher = Cipher;

  exports.encrypt = encrypt;

  exports.bulk_encrypt = bulk_encrypt;

}).call(this);

},{"./algbase":18,"./wordarray":38,"iced-coffee-script/lib/coffee-script/iced":9}],21:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var AES, Base, Concat, Decryptor, SHA512, Salsa20, TwoFish, V, WordArray, ctr, decrypt, iced, make_esc, salsa20, __iced_k, __iced_k_noop, _ref,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  iced = require('iced-coffee-script/lib/coffee-script/iced').runtime;
  __iced_k = __iced_k_noop = function() {};

  WordArray = require('./wordarray').WordArray;

  salsa20 = require('./salsa20');

  AES = require('./aes').AES;

  TwoFish = require('./twofish').TwoFish;

  ctr = require('./ctr');

  Concat = require('./combine').Concat;

  SHA512 = require('./sha512').SHA512;

  Salsa20 = require('./salsa20').Salsa20;

  _ref = require('./enc'), Base = _ref.Base, V = _ref.V;

  make_esc = require('iced-error').make_esc;

  Decryptor = (function(_super) {
    __extends(Decryptor, _super);

    function Decryptor(_arg) {
      var enc, key;
      key = _arg.key, enc = _arg.enc;
      Decryptor.__super__.constructor.call(this, {
        key: key
      });
      if (enc != null) {
        this.key = enc.key;
        this.derived_keys = enc.derived_keys;
      }
    }

    Decryptor.prototype.read_header = function(cb) {
      var err, wa;
      err = (wa = this.ct.unshift(2)) == null ? new Error("Ciphertext underrun in header") : (this.version = V[wa.words[1]]) == null ? new Error("bad header; couldn't find a good version (got " + wa.words[1] + ")") : wa.words[0] !== this.version.header[0] ? new Error("Bad header: unrecognized magic value") : null;
      return cb(err);
    };

    Decryptor.prototype.verify_sig = function(key, cb) {
      var computed, err, received, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      (function(__iced_k) {
        if ((received = _this.ct.unshift(Concat.get_output_size() / 4)) == null) {
          return __iced_k(err = new Error("Ciphertext underrun in signature"));
        } else {
          (function(__iced_k) {
            __iced_deferrals = new iced.Deferrals(__iced_k, {
              parent: ___iced_passed_deferral,
              filename: "src/dec.iced",
              funcname: "Decryptor.verify_sig"
            });
            _this.sign({
              input: _this.ct,
              key: key,
              salt: _this.salt
            }, __iced_deferrals.defer({
              assign_fn: (function() {
                return function() {
                  err = arguments[0];
                  return computed = arguments[1];
                };
              })(),
              lineno: 63
            }));
            __iced_deferrals._fulfill();
          })(function() {
            return __iced_k(err = err != null ? err : received.equal(computed) ? null : new Error('Signature mismatch or bad decryption key'));
          });
        }
      })(function() {
        return cb(err);
      });
    };

    Decryptor.prototype.unshift_iv = function(n_bytes, which, cb) {
      var err, iv;
      err = (iv = this.ct.unshift(n_bytes / 4)) != null ? null : new Error("Ciphertext underrun in " + which);
      return cb(err, iv);
    };

    Decryptor.prototype.read_salt = function(cb) {
      var err;
      err = (this.salt = this.ct.unshift(this.version.salt_size / 4)) == null ? new Error("Ciphertext underrrun in read_salt") : null;
      return cb(err);
    };

    Decryptor.prototype.generate_keys = function(_arg, cb) {
      var err, keys, progress_hook, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      progress_hook = _arg.progress_hook;
      (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral,
          filename: "src/dec.iced",
          funcname: "Decryptor.generate_keys"
        });
        _this.kdf({
          salt: _this.salt,
          progress_hook: progress_hook
        }, __iced_deferrals.defer({
          assign_fn: (function() {
            return function() {
              err = arguments[0];
              return keys = arguments[1];
            };
          })(),
          lineno: 114
        }));
        __iced_deferrals._fulfill();
      })(function() {
        return cb(err, keys);
      });
    };

    Decryptor.prototype.run = function(_arg, cb) {
      var ct1, ct2, data, esc, iv, progress_hook, pt, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      data = _arg.data, progress_hook = _arg.progress_hook;
      esc = make_esc(cb, "Decryptor::run");
      this.ct = WordArray.from_buffer(data);
      (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral,
          filename: "src/dec.iced",
          funcname: "Decryptor.run"
        });
        _this.read_header(esc(__iced_deferrals.defer({
          lineno: 141
        })));
        __iced_deferrals._fulfill();
      })(function() {
        (function(__iced_k) {
          __iced_deferrals = new iced.Deferrals(__iced_k, {
            parent: ___iced_passed_deferral,
            filename: "src/dec.iced",
            funcname: "Decryptor.run"
          });
          _this.read_salt(esc(__iced_deferrals.defer({
            lineno: 142
          })));
          __iced_deferrals._fulfill();
        })(function() {
          (function(__iced_k) {
            __iced_deferrals = new iced.Deferrals(__iced_k, {
              parent: ___iced_passed_deferral,
              filename: "src/dec.iced",
              funcname: "Decryptor.run"
            });
            _this.generate_keys({
              progress_hook: progress_hook
            }, esc(__iced_deferrals.defer({
              assign_fn: (function(__slot_1) {
                return function() {
                  return __slot_1.keys = arguments[0];
                };
              })(_this),
              lineno: 143
            })));
            __iced_deferrals._fulfill();
          })(function() {
            (function(__iced_k) {
              __iced_deferrals = new iced.Deferrals(__iced_k, {
                parent: ___iced_passed_deferral,
                filename: "src/dec.iced",
                funcname: "Decryptor.run"
              });
              _this.verify_sig(_this.keys.hmac, esc(__iced_deferrals.defer({
                lineno: 144
              })));
              __iced_deferrals._fulfill();
            })(function() {
              (function(__iced_k) {
                __iced_deferrals = new iced.Deferrals(__iced_k, {
                  parent: ___iced_passed_deferral,
                  filename: "src/dec.iced",
                  funcname: "Decryptor.run"
                });
                _this.unshift_iv(AES.ivSize, "AES", esc(__iced_deferrals.defer({
                  assign_fn: (function() {
                    return function() {
                      return iv = arguments[0];
                    };
                  })(),
                  lineno: 145
                })));
                __iced_deferrals._fulfill();
              })(function() {
                (function(__iced_k) {
                  __iced_deferrals = new iced.Deferrals(__iced_k, {
                    parent: ___iced_passed_deferral,
                    filename: "src/dec.iced",
                    funcname: "Decryptor.run"
                  });
                  _this.run_aes({
                    iv: iv,
                    input: _this.ct,
                    key: _this.keys.aes,
                    progress_hook: progress_hook
                  }, esc(__iced_deferrals.defer({
                    assign_fn: (function() {
                      return function() {
                        return ct2 = arguments[0];
                      };
                    })(),
                    lineno: 146
                  })));
                  __iced_deferrals._fulfill();
                })(function() {
                  (function(__iced_k) {
                    __iced_deferrals = new iced.Deferrals(__iced_k, {
                      parent: ___iced_passed_deferral,
                      filename: "src/dec.iced",
                      funcname: "Decryptor.run"
                    });
                    _this.unshift_iv(TwoFish.ivSize, "2fish", esc(__iced_deferrals.defer({
                      assign_fn: (function() {
                        return function() {
                          return iv = arguments[0];
                        };
                      })(),
                      lineno: 147
                    })));
                    __iced_deferrals._fulfill();
                  })(function() {
                    (function(__iced_k) {
                      __iced_deferrals = new iced.Deferrals(__iced_k, {
                        parent: ___iced_passed_deferral,
                        filename: "src/dec.iced",
                        funcname: "Decryptor.run"
                      });
                      _this.run_twofish({
                        iv: iv,
                        input: _this.ct,
                        key: _this.keys.twofish,
                        progress_hook: progress_hook
                      }, esc(__iced_deferrals.defer({
                        assign_fn: (function() {
                          return function() {
                            return ct1 = arguments[0];
                          };
                        })(),
                        lineno: 148
                      })));
                      __iced_deferrals._fulfill();
                    })(function() {
                      (function(__iced_k) {
                        __iced_deferrals = new iced.Deferrals(__iced_k, {
                          parent: ___iced_passed_deferral,
                          filename: "src/dec.iced",
                          funcname: "Decryptor.run"
                        });
                        _this.unshift_iv(Salsa20.ivSize, "Salsa", esc(__iced_deferrals.defer({
                          assign_fn: (function() {
                            return function() {
                              return iv = arguments[0];
                            };
                          })(),
                          lineno: 149
                        })));
                        __iced_deferrals._fulfill();
                      })(function() {
                        (function(__iced_k) {
                          __iced_deferrals = new iced.Deferrals(__iced_k, {
                            parent: ___iced_passed_deferral,
                            filename: "src/dec.iced",
                            funcname: "Decryptor.run"
                          });
                          _this.run_salsa20({
                            iv: iv,
                            input: _this.ct,
                            key: _this.keys.salsa20,
                            output_iv: false,
                            progress_hook: progress_hook
                          }, esc(__iced_deferrals.defer({
                            assign_fn: (function() {
                              return function() {
                                return pt = arguments[0];
                              };
                            })(),
                            lineno: 150
                          })));
                          __iced_deferrals._fulfill();
                        })(function() {
                          return cb(null, pt.to_buffer());
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    };

    return Decryptor;

  })(Base);

  decrypt = function(_arg, cb) {
    var data, dec, err, key, progress_hook, pt, ___iced_passed_deferral, __iced_deferrals, __iced_k,
      _this = this;
    __iced_k = __iced_k_noop;
    ___iced_passed_deferral = iced.findDeferral(arguments);
    key = _arg.key, data = _arg.data, progress_hook = _arg.progress_hook;
    dec = new Decryptor({
      key: key
    });
    (function(__iced_k) {
      __iced_deferrals = new iced.Deferrals(__iced_k, {
        parent: ___iced_passed_deferral,
        filename: "src/dec.iced",
        funcname: "decrypt"
      });
      dec.run({
        data: data,
        progress_hook: progress_hook
      }, __iced_deferrals.defer({
        assign_fn: (function() {
          return function() {
            err = arguments[0];
            return pt = arguments[1];
          };
        })(),
        lineno: 168
      }));
      __iced_deferrals._fulfill();
    })(function() {
      dec.scrub();
      return cb(err, pt);
    });
  };

  exports.Decryptor = Decryptor;

  exports.decrypt = decrypt;

}).call(this);

},{"./aes":17,"./combine":19,"./ctr":20,"./enc":23,"./salsa20":29,"./sha512":35,"./twofish":36,"./wordarray":38,"iced-coffee-script/lib/coffee-script/iced":9,"iced-error":10}],22:[function(require,module,exports){
(function (Buffer){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var ADRBG, DRBG, Lock, WordArray, XOR, hmac, iced, sha3, sha512, __iced_k, __iced_k_noop;

  iced = require('iced-coffee-script/lib/coffee-script/iced').runtime;
  __iced_k = __iced_k_noop = function() {};

  hmac = require('./hmac');

  XOR = require('./combine').XOR;

  sha512 = require('./sha512');

  sha3 = require('./sha3');

  WordArray = require('./wordarray').WordArray;

  Lock = require('./lock').Lock;

  DRBG = (function() {
    function DRBG(entropy, personalization_string, hmac_func) {
      this.hmac = hmac_func || hmac.sign;
      this.security_strength = 256;
      entropy = this.check_entropy(entropy);
      personalization_string || (personalization_string = new WordArray([]));
      this._instantiate(entropy, personalization_string);
    }

    DRBG.prototype.check_entropy = function(entropy, reseed) {
      if (reseed == null) {
        reseed = false;
      }
      if ((entropy.sigBytes * 8 * 2) < ((reseed ? 2 : 3) * this.security_strength)) {
        throw new Error("entropy must be at least " + (1.5 * this.security_strength) + " bits.");
      }
      return entropy;
    };

    DRBG.prototype._hmac = function(key, input) {
      return this.hmac({
        key: key,
        input: input
      });
    };

    DRBG.prototype._update = function(provided_data) {
      var V, V_in;
      V = new WordArray([0], 1);
      if (provided_data != null) {
        V = V.concat(provided_data);
      }
      V_in = this.V.clone().concat(V);
      this.K = this._hmac(this.K, V_in);
      V_in.scrub();
      V.scrub();
      this.V = this._hmac(this.K, this.V);
      if (provided_data != null) {
        V_in = this.V.clone().concat(new WordArray([1 << 24], 1)).concat(provided_data);
        this.K = this._hmac(this.K, V_in);
        V_in.scrub();
        this.V = this._hmac(this.K, this.V);
      }
      return provided_data != null ? provided_data.scrub() : void 0;
    };

    DRBG.prototype._instantiate = function(entropy, personalization_string) {
      var i, n, seed_material;
      seed_material = entropy.concat(personalization_string);
      n = 64;
      this.K = WordArray.from_buffer(new Buffer((function() {
        var _i, _results;
        _results = [];
        for (i = _i = 0; 0 <= n ? _i < n : _i > n; i = 0 <= n ? ++_i : --_i) {
          _results.push(0);
        }
        return _results;
      })()));
      this.V = WordArray.from_buffer(new Buffer((function() {
        var _i, _results;
        _results = [];
        for (i = _i = 0; 0 <= n ? _i < n : _i > n; i = 0 <= n ? ++_i : --_i) {
          _results.push(1);
        }
        return _results;
      })()));
      this._update(seed_material);
      entropy.scrub();
      return this.reseed_counter = 1;
    };

    DRBG.prototype.reseed = function(entropy) {
      this._update(this.check_entropy(entropy, true));
      return this.reseed_counter = 1;
    };

    DRBG.prototype.generate = function(num_bytes) {
      var i, tmp, _ref;
      if ((num_bytes * 8) > 7500) {
        throw new Error("generate cannot generate > 7500 bits in 1 call.");
      }
      if (this.reseed_counter >= 10000) {
        throw new Error("Need a reseed!");
      }
      tmp = [];
      i = 0;
      while ((tmp.length === 0) || (tmp.length * tmp[0].length * 4) < num_bytes) {
        this.V = this._hmac(this.K, this.V);
        tmp.push(this.V.words);
      }
      this._update();
      this.reseed_counter += 1;
      return (new WordArray((_ref = []).concat.apply(_ref, tmp))).truncate(num_bytes);
    };

    return DRBG;

  })();

  ADRBG = (function() {
    function ADRBG(gen_seed, hmac) {
      this.gen_seed = gen_seed;
      this.hmac = hmac;
      this.drbg = null;
      this.lock = new Lock();
    }

    ADRBG.prototype.generate = function(n, cb) {
      var ret, seed, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral,
          filename: "src/drbg.iced",
          funcname: "ADRBG.generate"
        });
        _this.lock.acquire(__iced_deferrals.defer({
          lineno: 148
        }));
        __iced_deferrals._fulfill();
      })(function() {
        (function(__iced_k) {
          if (_this.drbg == null) {
            (function(__iced_k) {
              __iced_deferrals = new iced.Deferrals(__iced_k, {
                parent: ___iced_passed_deferral,
                filename: "src/drbg.iced",
                funcname: "ADRBG.generate"
              });
              _this.gen_seed(256, __iced_deferrals.defer({
                assign_fn: (function() {
                  return function() {
                    return seed = arguments[0];
                  };
                })(),
                lineno: 150
              }));
              __iced_deferrals._fulfill();
            })(function() {
              return __iced_k(_this.drbg = new DRBG(seed, null, _this.hmac));
            });
          } else {
            return __iced_k();
          }
        })(function() {
          (function(__iced_k) {
            if (_this.drbg.reseed_counter > 100) {
              (function(__iced_k) {
                __iced_deferrals = new iced.Deferrals(__iced_k, {
                  parent: ___iced_passed_deferral,
                  filename: "src/drbg.iced",
                  funcname: "ADRBG.generate"
                });
                _this.gen_seed(256, __iced_deferrals.defer({
                  assign_fn: (function() {
                    return function() {
                      return seed = arguments[0];
                    };
                  })(),
                  lineno: 153
                }));
                __iced_deferrals._fulfill();
              })(function() {
                return __iced_k(_this.drbg.reseed(seed));
              });
            } else {
              return __iced_k();
            }
          })(function() {
            ret = _this.drbg.generate(n);
            _this.lock.release();
            return cb(ret);
          });
        });
      });
    };

    return ADRBG;

  })();

  exports.DRBG = DRBG;

  exports.ADRBG = ADRBG;

}).call(this);

}).call(this,require("buffer").Buffer)
},{"./combine":19,"./hmac":24,"./lock":25,"./sha3":34,"./sha512":35,"./wordarray":38,"buffer":1,"iced-coffee-script/lib/coffee-script/iced":9}],23:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var AES, Base, Concat, Encryptor, HMAC_SHA256, PBKDF2, SHA512, Scrypt, TwoFish, V, WordArray, XOR, ctr, encrypt, iced, make_esc, prng, salsa20, util, __iced_k, __iced_k_noop, _ref,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  iced = require('iced-coffee-script/lib/coffee-script/iced').runtime;
  __iced_k = __iced_k_noop = function() {};

  WordArray = require('./wordarray').WordArray;

  salsa20 = require('./salsa20');

  AES = require('./aes').AES;

  TwoFish = require('./twofish').TwoFish;

  ctr = require('./ctr');

  _ref = require('./combine'), XOR = _ref.XOR, Concat = _ref.Concat;

  SHA512 = require('./sha512').SHA512;

  PBKDF2 = require('./pbkdf2').PBKDF2;

  Scrypt = require('./scrypt').Scrypt;

  util = require('./util');

  prng = require('./prng');

  make_esc = require('iced-error').make_esc;

  HMAC_SHA256 = require('./hmac').HMAC_SHA256;

  V = {
    "1": {
      header: [0x1c94d7de, 1],
      salt_size: 8,
      xsalsa20_rev: true,
      kdf: {
        klass: PBKDF2,
        opts: {
          c: 1024,
          klass: XOR
        }
      },
      hmac_key_size: 768 / 8
    },
    "2": {
      header: [0x1c94d7de, 2],
      salt_size: 16,
      xsalsa20_rev: true,
      kdf: {
        klass: Scrypt,
        opts: {
          c: 64,
          klass: XOR,
          N: 12,
          r: 8,
          p: 1
        }
      },
      hmac_key_size: 768 / 8
    },
    "3": {
      header: [0x1c94d7de, 3],
      salt_size: 16,
      xsalsa20_rev: false,
      kdf: {
        klass: Scrypt,
        opts: {
          c: 1,
          klass: HMAC_SHA256,
          N: 16,
          r: 8,
          p: 1
        }
      },
      hmac_key_size: 768 / 8
    }
  };

  Base = (function() {
    function Base(_arg) {
      var key, version;
      key = _arg.key, version = _arg.version;
      this.version = V[version != null ? version : 1];
      if (this.version == null) {
        throw new Error("unknown version: " + version);
      }
      this.set_key(key);
      this.derived_keys = {};
    }

    Base.prototype.kdf = function(_arg, cb) {
      var args, dkLen, end, extra_keymaterial, i, k, key, keys, len, lens, order, progress_hook, raw, salt, salt_hex, v, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      salt = _arg.salt, extra_keymaterial = _arg.extra_keymaterial, progress_hook = _arg.progress_hook;
      (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral,
          filename: "src/enc.iced",
          funcname: "Base.kdf"
        });
        _this._check_scrubbed(_this.key, "in KDF", cb, __iced_deferrals.defer({
          lineno: 90
        }));
        __iced_deferrals._fulfill();
      })(function() {
        salt_hex = salt.to_hex();
        key = _this.key.clone();
        (function(__iced_k) {
          __iced_deferrals = new iced.Deferrals(__iced_k, {
            parent: ___iced_passed_deferral,
            filename: "src/enc.iced",
            funcname: "Base.kdf"
          });
          _this._check_scrubbed(key, "KDF", cb, __iced_deferrals.defer({
            lineno: 98
          }));
          __iced_deferrals._fulfill();
        })(function() {
          (function(__iced_k) {
            if ((keys = _this.derived_keys[salt_hex]) == null) {
              _this._kdf = new _this.version.kdf.klass(_this.version.kdf.opts);
              lens = {
                hmac: _this.version.hmac_key_size,
                aes: AES.keySize,
                twofish: TwoFish.keySize,
                salsa20: salsa20.Salsa20.keySize
              };
              order = ['hmac', 'aes', 'twofish', 'salsa20'];
              dkLen = extra_keymaterial || 0;
              for (k in lens) {
                v = lens[k];
                dkLen += v;
              }
              args = {
                dkLen: dkLen,
                key: key,
                progress_hook: progress_hook,
                salt: salt
              };
              (function(__iced_k) {
                __iced_deferrals = new iced.Deferrals(__iced_k, {
                  parent: ___iced_passed_deferral,
                  filename: "src/enc.iced",
                  funcname: "Base.kdf"
                });
                _this._kdf.run(args, __iced_deferrals.defer({
                  assign_fn: (function() {
                    return function() {
                      return raw = arguments[0];
                    };
                  })(),
                  lineno: 117
                }));
                __iced_deferrals._fulfill();
              })(function() {
                var _i, _len;
                keys = {};
                i = 0;
                for (_i = 0, _len = order.length; _i < _len; _i++) {
                  k = order[_i];
                  v = lens[k];
                  len = v / 4;
                  end = i + len;
                  keys[k] = new WordArray(raw.words.slice(i, end));
                  i = end;
                }
                keys.extra = (new WordArray(raw.words.slice(end))).to_buffer();
                return __iced_k(_this.derived_keys[salt_hex] = keys);
              });
            } else {
              return __iced_k();
            }
          })(function() {
            return cb(null, keys);
          });
        });
      });
    };

    Base.prototype.set_key = function(key) {
      var wakey;
      if (key != null) {
        wakey = WordArray.from_buffer(key);
        if (!this.key || !this.key.equal(wakey)) {
          this.scrub();
          return this.key = wakey;
        }
      } else {
        return this.scrub();
      }
    };

    Base.prototype._check_scrubbed = function(key, where, ecb, okcb) {
      if ((key != null) && !key.is_scrubbed()) {
        return okcb();
      } else {
        return ecb(new Error("" + where + ": Failed due to scrubbed key!"), null);
      }
    };

    Base.prototype.sign = function(_arg, cb) {
      var input, key, out, progress_hook, salt, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      input = _arg.input, key = _arg.key, salt = _arg.salt, progress_hook = _arg.progress_hook;
      (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral,
          filename: "src/enc.iced",
          funcname: "Base.sign"
        });
        _this._check_scrubbed(key, "HMAC", cb, __iced_deferrals.defer({
          lineno: 175
        }));
        __iced_deferrals._fulfill();
      })(function() {
        input = (new WordArray(_this.version.header)).concat(salt).concat(input);
        (function(__iced_k) {
          __iced_deferrals = new iced.Deferrals(__iced_k, {
            parent: ___iced_passed_deferral,
            filename: "src/enc.iced",
            funcname: "Base.sign"
          });
          Concat.bulk_sign({
            key: key,
            input: input,
            progress_hook: progress_hook
          }, __iced_deferrals.defer({
            assign_fn: (function() {
              return function() {
                return out = arguments[0];
              };
            })(),
            lineno: 177
          }));
          __iced_deferrals._fulfill();
        })(function() {
          input.scrub();
          return cb(null, out);
        });
      });
    };

    Base.prototype.run_salsa20 = function(_arg, cb) {
      var args, ct, input, iv, key, output_iv, progress_hook, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      input = _arg.input, key = _arg.key, iv = _arg.iv, output_iv = _arg.output_iv, progress_hook = _arg.progress_hook;
      (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral,
          filename: "src/enc.iced",
          funcname: "Base.run_salsa20"
        });
        _this._check_scrubbed(key, "Salsa20", cb, __iced_deferrals.defer({
          lineno: 193
        }));
        __iced_deferrals._fulfill();
      })(function() {
        args = {
          input: input,
          progress_hook: progress_hook,
          key: key,
          iv: iv
        };
        if (_this.version.xsalsa20_rev) {
          args.key = key.clone().endian_reverse();
          args.iv = iv.clone().endian_reverse();
        }
        (function(__iced_k) {
          __iced_deferrals = new iced.Deferrals(__iced_k, {
            parent: ___iced_passed_deferral,
            filename: "src/enc.iced",
            funcname: "Base.run_salsa20"
          });
          salsa20.bulk_encrypt(args, __iced_deferrals.defer({
            assign_fn: (function() {
              return function() {
                return ct = arguments[0];
              };
            })(),
            lineno: 205
          }));
          __iced_deferrals._fulfill();
        })(function() {
          if (output_iv) {
            ct = iv.clone().concat(ct);
          }
          if (_this.version.xsalsa20_rev) {
            args.key.scrub();
            args.iv.scrub();
          }
          return cb(null, ct);
        });
      });
    };

    Base.prototype.run_twofish = function(_arg, cb) {
      var block_cipher, ct, input, iv, key, progress_hook, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      input = _arg.input, key = _arg.key, iv = _arg.iv, progress_hook = _arg.progress_hook;
      (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral,
          filename: "src/enc.iced",
          funcname: "Base.run_twofish"
        });
        _this._check_scrubbed(key, "TwoFish", cb, __iced_deferrals.defer({
          lineno: 228
        }));
        __iced_deferrals._fulfill();
      })(function() {
        block_cipher = new TwoFish(key);
        (function(__iced_k) {
          __iced_deferrals = new iced.Deferrals(__iced_k, {
            parent: ___iced_passed_deferral,
            filename: "src/enc.iced",
            funcname: "Base.run_twofish"
          });
          ctr.bulk_encrypt({
            block_cipher: block_cipher,
            iv: iv,
            input: input,
            progress_hook: progress_hook,
            what: "twofish"
          }, __iced_deferrals.defer({
            assign_fn: (function() {
              return function() {
                return ct = arguments[0];
              };
            })(),
            lineno: 230
          }));
          __iced_deferrals._fulfill();
        })(function() {
          block_cipher.scrub();
          return cb(null, iv.clone().concat(ct));
        });
      });
    };

    Base.prototype.run_aes = function(_arg, cb) {
      var block_cipher, ct, input, iv, key, progress_hook, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      input = _arg.input, key = _arg.key, iv = _arg.iv, progress_hook = _arg.progress_hook;
      (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral,
          filename: "src/enc.iced",
          funcname: "Base.run_aes"
        });
        _this._check_scrubbed(key, "AES", cb, __iced_deferrals.defer({
          lineno: 245
        }));
        __iced_deferrals._fulfill();
      })(function() {
        block_cipher = new AES(key);
        (function(__iced_k) {
          __iced_deferrals = new iced.Deferrals(__iced_k, {
            parent: ___iced_passed_deferral,
            filename: "src/enc.iced",
            funcname: "Base.run_aes"
          });
          ctr.bulk_encrypt({
            block_cipher: block_cipher,
            iv: iv,
            input: input,
            progress_hook: progress_hook,
            what: "aes"
          }, __iced_deferrals.defer({
            assign_fn: (function() {
              return function() {
                return ct = arguments[0];
              };
            })(),
            lineno: 247
          }));
          __iced_deferrals._fulfill();
        })(function() {
          block_cipher.scrub();
          return cb(null, iv.clone().concat(ct));
        });
      });
    };

    Base.prototype.scrub = function() {
      var key, key_ring, salt, _i, _len, _ref1;
      if (this.key != null) {
        this.key.scrub();
      }
      if (this.derived_keys != null) {
        _ref1 = this.derived_keys;
        for (salt in _ref1) {
          key_ring = _ref1[salt];
          for (_i = 0, _len = key_ring.length; _i < _len; _i++) {
            key = key_ring[_i];
            key.scrub();
          }
        }
      }
      this.derived_keys = {};
      if (this.salt != null) {
        this.salt.scrub();
      }
      this.salt = null;
      return this.key = null;
    };

    return Base;

  })();

  Encryptor = (function(_super) {
    __extends(Encryptor, _super);

    function Encryptor(_arg) {
      var key, rng, version;
      key = _arg.key, rng = _arg.rng, version = _arg.version;
      Encryptor.__super__.constructor.call(this, {
        key: key,
        version: version
      });
      this.rng = rng || prng.generate;
    }

    Encryptor.prototype.pick_random_ivs = function(_arg, cb) {
      var iv_lens, ivs, k, progress_hook, v, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      progress_hook = _arg.progress_hook;
      iv_lens = {
        aes: AES.ivSize,
        twofish: TwoFish.ivSize,
        salsa20: salsa20.Salsa20.ivSize
      };
      ivs = {};
      (function(__iced_k) {
        var _i, _k, _keys, _ref1, _results, _while;
        _ref1 = iv_lens;
        _keys = (function() {
          var _results1;
          _results1 = [];
          for (_k in _ref1) {
            _results1.push(_k);
          }
          return _results1;
        })();
        _i = 0;
        _results = [];
        _while = function(__iced_k) {
          var _break, _continue, _next;
          _break = function() {
            return __iced_k(_results);
          };
          _continue = function() {
            return iced.trampoline(function() {
              ++_i;
              return _while(__iced_k);
            });
          };
          _next = function(__iced_next_arg) {
            _results.push(__iced_next_arg);
            return _continue();
          };
          if (!(_i < _keys.length)) {
            return _break();
          } else {
            k = _keys[_i];
            v = _ref1[k];
            (function(__iced_k) {
              __iced_deferrals = new iced.Deferrals(__iced_k, {
                parent: ___iced_passed_deferral,
                filename: "src/enc.iced",
                funcname: "Encryptor.pick_random_ivs"
              });
              _this.rng(v, __iced_deferrals.defer({
                assign_fn: (function(__slot_1, __slot_2) {
                  return function() {
                    return __slot_1[__slot_2] = arguments[0];
                  };
                })(ivs, k),
                lineno: 349
              }));
              __iced_deferrals._fulfill();
            })(_next);
          }
        };
        _while(__iced_k);
      })(function() {
        return cb(ivs);
      });
    };

    Encryptor.prototype.resalt = function(_arg, cb) {
      var err, extra_keymaterial, progress_hook, salt, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      salt = _arg.salt, extra_keymaterial = _arg.extra_keymaterial, progress_hook = _arg.progress_hook;
      err = null;
      (function(__iced_k) {
        if (salt == null) {
          (function(__iced_k) {
            __iced_deferrals = new iced.Deferrals(__iced_k, {
              parent: ___iced_passed_deferral,
              filename: "src/enc.iced",
              funcname: "Encryptor.resalt"
            });
            _this.rng(_this.version.salt_size, __iced_deferrals.defer({
              assign_fn: (function(__slot_1) {
                return function() {
                  return __slot_1.salt = arguments[0];
                };
              })(_this),
              lineno: 365
            }));
            __iced_deferrals._fulfill();
          })(__iced_k);
        } else {
          return __iced_k(salt.length !== _this.version.salt_size ? err = new Error("Need a salt of exactly " + _this.version.salt_size + " bytes (got " + salt.length + ")") : _this.salt = WordArray.alloc(salt));
        }
      })(function() {
        (function(__iced_k) {
          if (err == null) {
            (function(__iced_k) {
              __iced_deferrals = new iced.Deferrals(__iced_k, {
                parent: ___iced_passed_deferral,
                filename: "src/enc.iced",
                funcname: "Encryptor.resalt"
              });
              _this.kdf({
                extra_keymaterial: extra_keymaterial,
                progress_hook: progress_hook,
                salt: _this.salt
              }, __iced_deferrals.defer({
                assign_fn: (function(__slot_1) {
                  return function() {
                    err = arguments[0];
                    return __slot_1.keys = arguments[1];
                  };
                })(_this),
                lineno: 371
              }));
              __iced_deferrals._fulfill();
            })(__iced_k);
          } else {
            return __iced_k();
          }
        })(function() {
          return cb(err, _this.keys);
        });
      });
    };

    Encryptor.prototype.run = function(_arg, cb) {
      var ct1, ct2, ct3, data, esc, extra_keymaterial, ivs, progress_hook, pt, ret, salt, sig, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      data = _arg.data, salt = _arg.salt, extra_keymaterial = _arg.extra_keymaterial, progress_hook = _arg.progress_hook;
      esc = make_esc(cb, "Encryptor::run");
      (function(__iced_k) {
        if ((salt != null) || (_this.salt == null)) {
          (function(__iced_k) {
            __iced_deferrals = new iced.Deferrals(__iced_k, {
              parent: ___iced_passed_deferral,
              filename: "src/enc.iced",
              funcname: "Encryptor.run"
            });
            _this.resalt({
              salt: salt,
              extra_keymaterial: extra_keymaterial,
              progress_hook: progress_hook
            }, esc(__iced_deferrals.defer({
              lineno: 402
            })));
            __iced_deferrals._fulfill();
          })(__iced_k);
        } else {
          return __iced_k();
        }
      })(function() {
        (function(__iced_k) {
          __iced_deferrals = new iced.Deferrals(__iced_k, {
            parent: ___iced_passed_deferral,
            filename: "src/enc.iced",
            funcname: "Encryptor.run"
          });
          _this.pick_random_ivs({
            progress_hook: progress_hook
          }, __iced_deferrals.defer({
            assign_fn: (function() {
              return function() {
                return ivs = arguments[0];
              };
            })(),
            lineno: 403
          }));
          __iced_deferrals._fulfill();
        })(function() {
          pt = WordArray.from_buffer(data);
          (function(__iced_k) {
            __iced_deferrals = new iced.Deferrals(__iced_k, {
              parent: ___iced_passed_deferral,
              filename: "src/enc.iced",
              funcname: "Encryptor.run"
            });
            _this.run_salsa20({
              input: pt,
              key: _this.keys.salsa20,
              progress_hook: progress_hook,
              iv: ivs.salsa20,
              output_iv: true
            }, esc(__iced_deferrals.defer({
              assign_fn: (function() {
                return function() {
                  return ct1 = arguments[0];
                };
              })(),
              lineno: 405
            })));
            __iced_deferrals._fulfill();
          })(function() {
            (function(__iced_k) {
              __iced_deferrals = new iced.Deferrals(__iced_k, {
                parent: ___iced_passed_deferral,
                filename: "src/enc.iced",
                funcname: "Encryptor.run"
              });
              _this.run_twofish({
                input: ct1,
                key: _this.keys.twofish,
                progress_hook: progress_hook,
                iv: ivs.twofish
              }, esc(__iced_deferrals.defer({
                assign_fn: (function() {
                  return function() {
                    return ct2 = arguments[0];
                  };
                })(),
                lineno: 406
              })));
              __iced_deferrals._fulfill();
            })(function() {
              (function(__iced_k) {
                __iced_deferrals = new iced.Deferrals(__iced_k, {
                  parent: ___iced_passed_deferral,
                  filename: "src/enc.iced",
                  funcname: "Encryptor.run"
                });
                _this.run_aes({
                  input: ct2,
                  key: _this.keys.aes,
                  progress_hook: progress_hook,
                  iv: ivs.aes
                }, esc(__iced_deferrals.defer({
                  assign_fn: (function() {
                    return function() {
                      return ct3 = arguments[0];
                    };
                  })(),
                  lineno: 407
                })));
                __iced_deferrals._fulfill();
              })(function() {
                (function(__iced_k) {
                  __iced_deferrals = new iced.Deferrals(__iced_k, {
                    parent: ___iced_passed_deferral,
                    filename: "src/enc.iced",
                    funcname: "Encryptor.run"
                  });
                  _this.sign({
                    input: ct3,
                    key: _this.keys.hmac,
                    progress_hook: progress_hook,
                    salt: _this.salt
                  }, esc(__iced_deferrals.defer({
                    assign_fn: (function() {
                      return function() {
                        return sig = arguments[0];
                      };
                    })(),
                    lineno: 408
                  })));
                  __iced_deferrals._fulfill();
                })(function() {
                  ret = (new WordArray(_this.version.header)).concat(_this.salt).concat(sig).concat(ct3).to_buffer();
                  util.scrub_buffer(data);
                  return cb(null, ret);
                });
              });
            });
          });
        });
      });
    };

    return Encryptor;

  })(Base);

  encrypt = function(_arg, cb) {
    var data, enc, err, key, progress_hook, ret, rng, version, ___iced_passed_deferral, __iced_deferrals, __iced_k,
      _this = this;
    __iced_k = __iced_k_noop;
    ___iced_passed_deferral = iced.findDeferral(arguments);
    key = _arg.key, data = _arg.data, rng = _arg.rng, progress_hook = _arg.progress_hook, version = _arg.version;
    enc = new Encryptor({
      key: key,
      rng: rng,
      version: version
    });
    (function(__iced_k) {
      __iced_deferrals = new iced.Deferrals(__iced_k, {
        parent: ___iced_passed_deferral,
        filename: "src/enc.iced",
        funcname: "encrypt"
      });
      enc.run({
        data: data,
        progress_hook: progress_hook
      }, __iced_deferrals.defer({
        assign_fn: (function() {
          return function() {
            err = arguments[0];
            return ret = arguments[1];
          };
        })(),
        lineno: 436
      }));
      __iced_deferrals._fulfill();
    })(function() {
      enc.scrub();
      return cb(err, ret);
    });
  };

  exports.V = V;

  exports.encrypt = encrypt;

  exports.Base = Base;

  exports.Encryptor = Encryptor;

}).call(this);

},{"./aes":17,"./combine":19,"./ctr":20,"./hmac":24,"./pbkdf2":27,"./prng":28,"./salsa20":29,"./scrypt":30,"./sha512":35,"./twofish":36,"./util":37,"./wordarray":38,"iced-coffee-script/lib/coffee-script/iced":9,"iced-error":10}],24:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var HMAC, HMAC_SHA256, SHA256, SHA512, bulk_sign, iced, sign, util, __iced_k, __iced_k_noop,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  iced = require('iced-coffee-script/lib/coffee-script/iced').runtime;
  __iced_k = __iced_k_noop = function() {};

  SHA512 = require('./sha512').SHA512;

  SHA256 = require('./sha256').SHA256;

  util = require('./util');

  HMAC = (function() {
    HMAC.outputSize = 512 / 8;

    HMAC.prototype.outputSize = HMAC.outputSize;

    function HMAC(key, klass) {
      var i, _i, _ref;
      if (klass == null) {
        klass = SHA512;
      }
      this.key = key.clone();
      this.hasher = new klass();
      this.hasherBlockSize = this.hasher.blockSize;
      this.hasherBlockSizeBytes = this.hasherBlockSize * 4;
      if (this.key.sigBytes > this.hasherBlockSizeBytes) {
        this.key = this.hasher.finalize(this.key);
      }
      this.key.clamp();
      this._oKey = this.key.clone();
      this._iKey = this.key.clone();
      for (i = _i = 0, _ref = this.hasherBlockSize; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
        this._oKey.words[i] ^= 0x5c5c5c5c;
        this._iKey.words[i] ^= 0x36363636;
      }
      this._oKey.sigBytes = this._iKey.sigBytes = this.hasherBlockSizeBytes;
      this.reset();
    }

    HMAC.prototype.get_output_size = function() {
      return this.hasher.output_size;
    };

    HMAC.prototype.reset = function() {
      return this.hasher.reset().update(this._iKey);
    };

    HMAC.prototype.update = function(wa) {
      this.hasher.update(wa);
      return this;
    };

    HMAC.prototype.finalize = function(wa) {
      var innerHash, innerHash2, out;
      innerHash = this.hasher.finalize(wa);
      this.hasher.reset();
      innerHash2 = this._oKey.clone().concat(innerHash);
      out = this.hasher.finalize(innerHash2);
      innerHash.scrub();
      innerHash2.scrub();
      return out;
    };

    HMAC.prototype.scrub = function() {
      this.key.scrub();
      this._iKey.scrub();
      return this._oKey.scrub();
    };

    return HMAC;

  })();

  sign = function(_arg) {
    var eng, hash_class, input, key, out;
    key = _arg.key, input = _arg.input, hash_class = _arg.hash_class;
    eng = new HMAC(key, hash_class);
    out = eng.finalize(input.clamp());
    eng.scrub();
    return out;
  };

  bulk_sign = function(_arg, cb) {
    var eng, input, key, klass, progress_hook, res, slice_args, what, ___iced_passed_deferral, __iced_deferrals, __iced_k,
      _this = this;
    __iced_k = __iced_k_noop;
    ___iced_passed_deferral = iced.findDeferral(arguments);
    key = _arg.key, input = _arg.input, progress_hook = _arg.progress_hook, klass = _arg.klass, what = _arg.what;
    klass || (klass = HMAC);
    what || (what = "hmac_sha512");
    eng = new klass(key);
    input.clamp();
    slice_args = {
      update: function(lo, hi) {
        return eng.update(input.slice(lo, hi));
      },
      finalize: function() {
        return eng.finalize();
      },
      default_n: eng.hasherBlockSize * 1000
    };
    (function(__iced_k) {
      __iced_deferrals = new iced.Deferrals(__iced_k, {
        parent: ___iced_passed_deferral,
        filename: "src/hmac.iced",
        funcname: "bulk_sign"
      });
      util.bulk(input.sigBytes, slice_args, {
        what: what,
        progress_hook: progress_hook,
        cb: __iced_deferrals.defer({
          assign_fn: (function() {
            return function() {
              return res = arguments[0];
            };
          })(),
          lineno: 137
        })
      });
      __iced_deferrals._fulfill();
    })(function() {
      eng.scrub();
      return cb(res);
    });
  };

  exports.HMAC_SHA256 = HMAC_SHA256 = (function(_super) {
    __extends(HMAC_SHA256, _super);

    function HMAC_SHA256(key) {
      HMAC_SHA256.__super__.constructor.call(this, key, SHA256);
    }

    return HMAC_SHA256;

  })(HMAC);

  exports.HMAC = HMAC;

  exports.sign = sign;

  exports.bulk_sign = bulk_sign;

}).call(this);

},{"./sha256":33,"./sha512":35,"./util":37,"iced-coffee-script/lib/coffee-script/iced":9}],25:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var Lock, NamedLock, Table, iced, __iced_k, __iced_k_noop,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  iced = require('iced-coffee-script/lib/coffee-script/iced').runtime;
  __iced_k = __iced_k_noop = function() {};

  Lock = (function() {
    function Lock() {
      this._open = true;
      this._waiters = [];
    }

    Lock.prototype.acquire = function(cb) {
      if (this._open) {
        this._open = false;
        return cb();
      } else {
        return this._waiters.push(cb);
      }
    };

    Lock.prototype.release = function() {
      var w;
      if (this._waiters.length) {
        w = this._waiters.shift();
        return w();
      } else {
        return this._open = true;
      }
    };

    Lock.prototype.open = function() {
      return this._open;
    };

    return Lock;

  })();

  NamedLock = (function(_super) {
    __extends(NamedLock, _super);

    function NamedLock(tab, name) {
      this.tab = tab;
      this.name = name;
      NamedLock.__super__.constructor.call(this);
      this.refs = 0;
    }

    NamedLock.prototype.incref = function() {
      return ++this.refs;
    };

    NamedLock.prototype.decref = function() {
      return --this.refs;
    };

    NamedLock.prototype.release = function() {
      NamedLock.__super__.release.call(this);
      if (this.decref() === 0) {
        return delete this.tab[this.name];
      }
    };

    return NamedLock;

  })(Lock);

  Table = (function() {
    function Table() {
      this.locks = {};
    }

    Table.prototype.create = function(name) {
      var l;
      l = new NamedLock(this, name);
      return this.locks[name] = l;
    };

    Table.prototype.acquire = function(name, cb, wait) {
      var l, was_open, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      l = this.locks[name] || this.create(name);
      was_open = l._open;
      l.incref();
      (function(__iced_k) {
        if (wait || l._open) {
          (function(__iced_k) {
            __iced_deferrals = new iced.Deferrals(__iced_k, {
              parent: ___iced_passed_deferral,
              filename: "src/lock.iced",
              funcname: "Table.acquire"
            });
            l.acquire(__iced_deferrals.defer({
              lineno: 68
            }));
            __iced_deferrals._fulfill();
          })(__iced_k);
        } else {
          return __iced_k(l = null);
        }
      })(function() {
        return cb(l, was_open);
      });
    };

    Table.prototype.lookup = function(name) {
      return this.locks[name];
    };

    return Table;

  })();

  exports.Lock = Lock;

  exports.Table = Table;

}).call(this);

},{"iced-coffee-script/lib/coffee-script/iced":9}],26:[function(require,module,exports){
(function (Buffer){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var k, v, _ref, _ref1;



  _ref = require('./enc');
  for (k in _ref) {
    v = _ref[k];
    exports[k] = v;
  }

  _ref1 = require('./dec');
  for (k in _ref1) {
    v = _ref1[k];
    exports[k] = v;
  }

  exports.prng = require('./prng');

  exports.Buffer = Buffer;

  exports.WordArray = require('./wordarray').WordArray;

  exports.util = require('./util');

  exports.ciphers = {
    AES: require('./aes').AES,
    TwoFish: require('./twofish').TwoFish
  };

  exports.hash = {
    SHA1: require('./sha1').SHA1,
    SHA224: require('./sha224').SHA224,
    SHA256: require('./sha256').SHA256,
    SHA512: require('./sha512').SHA512,
    SHA3: require('./sha3').SHA3
  };

  exports.scrypt = require('./scrypt').scrypt;

  exports.pbkdf2 = require('./pbkdf2').pbkdf2;

  exports.HMAC_SHA256 = require('./hmac').HMAC_SHA256;

}).call(this);

}).call(this,require("buffer").Buffer)
},{"./aes":17,"./dec":21,"./enc":23,"./hmac":24,"./pbkdf2":27,"./prng":28,"./scrypt":30,"./sha1":31,"./sha224":32,"./sha256":33,"./sha3":34,"./sha512":35,"./twofish":36,"./util":37,"./wordarray":38,"buffer":1}],27:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var HMAC, PBKDF2, WordArray, iced, pbkdf2, util, __iced_k, __iced_k_noop;

  iced = require('iced-coffee-script/lib/coffee-script/iced').runtime;
  __iced_k = __iced_k_noop = function() {};

  HMAC = require('./hmac').HMAC;

  WordArray = require('./wordarray').WordArray;

  util = require('./util');

  PBKDF2 = (function() {
    function PBKDF2(_arg) {
      this.klass = _arg.klass, this.c = _arg.c;
      this.c || (this.c = 1024);
      this.klass || (this.klass = HMAC);
    }

    PBKDF2.prototype._PRF = function(input) {
      this.prf.reset();
      return this.prf.finalize(input);
    };

    PBKDF2.prototype._gen_T_i = function(_arg, cb) {
      var U, i, progress_hook, ret, salt, seed, stop, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      salt = _arg.salt, i = _arg.i, progress_hook = _arg.progress_hook;
      progress_hook(0);
      seed = salt.clone().concat(new WordArray([i]));
      U = this._PRF(seed);
      ret = U.clone();
      i = 1;
      (function(__iced_k) {
        var _results, _while;
        _results = [];
        _while = function(__iced_k) {
          var _break, _continue, _next;
          _break = function() {
            return __iced_k(_results);
          };
          _continue = function() {
            return iced.trampoline(function() {
              return _while(__iced_k);
            });
          };
          _next = function(__iced_next_arg) {
            _results.push(__iced_next_arg);
            return _continue();
          };
          if (!(i < _this.c)) {
            return _break();
          } else {
            stop = Math.min(_this.c, i + 128);
            while (i < stop) {
              U = _this._PRF(U);
              ret.xor(U, {});
              i++;
            }
            progress_hook(i);
            (function(__iced_k) {
              __iced_deferrals = new iced.Deferrals(__iced_k, {
                parent: ___iced_passed_deferral,
                filename: "src/pbkdf2.iced",
                funcname: "PBKDF2._gen_T_i"
              });
              util.default_delay(0, 0, __iced_deferrals.defer({
                lineno: 57
              }));
              __iced_deferrals._fulfill();
            })(function() {
              return _next(null);
            });
          }
        };
        _while(__iced_k);
      })(function() {
        progress_hook(i);
        return cb(ret);
      });
    };

    PBKDF2.prototype.run = function(_arg, cb) {
      var bs, dkLen, flat, i, key, n, ph, progress_hook, salt, tmp, tph, words, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      key = _arg.key, salt = _arg.salt, dkLen = _arg.dkLen, progress_hook = _arg.progress_hook;
      this.prf = new this.klass(key);
      bs = this.prf.get_output_size();
      n = Math.ceil(dkLen / bs);
      words = [];
      tph = null;
      ph = function(block) {
        return function(iter) {
          return typeof progress_hook === "function" ? progress_hook({
            what: "pbkdf2",
            total: n * _this.c,
            i: block * _this.c + iter
          }) : void 0;
        };
      };
      ph(0)(0);
      (function(__iced_k) {
        var _i, _results, _while;
        i = 1;
        _results = [];
        _while = function(__iced_k) {
          var _break, _continue, _next;
          _break = function() {
            return __iced_k(_results);
          };
          _continue = function() {
            return iced.trampoline(function() {
              ++i;
              return _while(__iced_k);
            });
          };
          _next = function(__iced_next_arg) {
            _results.push(__iced_next_arg);
            return _continue();
          };
          if (!(i <= n)) {
            return _break();
          } else {

            (function(__iced_k) {
              __iced_deferrals = new iced.Deferrals(__iced_k, {
                parent: ___iced_passed_deferral,
                filename: "src/pbkdf2.iced",
                funcname: "PBKDF2.run"
              });
              _this._gen_T_i({
                salt: salt,
                i: i,
                progress_hook: ph(i - 1)
              }, __iced_deferrals.defer({
                assign_fn: (function() {
                  return function() {
                    return tmp = arguments[0];
                  };
                })(),
                lineno: 80
              }));
              __iced_deferrals._fulfill();
            })(function() {
              return _next(words.push(tmp.words));
            });
          }
        };
        _while(__iced_k);
      })(function() {
        var _ref;
        ph(n)(0);
        flat = (_ref = []).concat.apply(_ref, words);
        key.scrub();
        _this.prf.scrub();
        _this.prf = null;
        return cb(new WordArray(flat, dkLen));
      });
    };

    return PBKDF2;

  })();

  pbkdf2 = function(_arg, cb) {
    var c, dkLen, eng, key, klass, out, progress_hook, salt, ___iced_passed_deferral, __iced_deferrals, __iced_k,
      _this = this;
    __iced_k = __iced_k_noop;
    ___iced_passed_deferral = iced.findDeferral(arguments);
    key = _arg.key, salt = _arg.salt, klass = _arg.klass, c = _arg.c, dkLen = _arg.dkLen, progress_hook = _arg.progress_hook;
    eng = new PBKDF2({
      klass: klass,
      c: c
    });
    (function(__iced_k) {
      __iced_deferrals = new iced.Deferrals(__iced_k, {
        parent: ___iced_passed_deferral,
        filename: "src/pbkdf2.iced",
        funcname: "pbkdf2"
      });
      eng.run({
        key: key,
        salt: salt,
        dkLen: dkLen,
        progress_hook: progress_hook
      }, __iced_deferrals.defer({
        assign_fn: (function() {
          return function() {
            return out = arguments[0];
          };
        })(),
        lineno: 106
      }));
      __iced_deferrals._fulfill();
    })(function() {
      return cb(out);
    });
  };

  exports.pbkdf2 = pbkdf2;

  exports.PBKDF2 = PBKDF2;

}).call(this);

},{"./hmac":24,"./util":37,"./wordarray":38,"iced-coffee-script/lib/coffee-script/iced":9}],28:[function(require,module,exports){
(function (Buffer){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var ADRBG, PRNG, WordArray, XOR, browser_rng, e, generate, iced, more_entropy, native_rng, rng, util, __iced_k, __iced_k_noop, _native_rng, _prng, _ref;

  iced = require('iced-coffee-script/lib/coffee-script/iced').runtime;
  __iced_k = __iced_k_noop = function() {};

  more_entropy = require('more-entropy');

  ADRBG = require('./drbg').ADRBG;

  WordArray = require('./wordarray').WordArray;

  XOR = require('./combine').XOR;

  util = require('./util');

  browser_rng = function(n) {
    var v;
    v = new Uint8Array(n);
    window.crypto.getRandomValues(v);
    return new Buffer(v);
  };

  if ((typeof window !== "undefined" && window !== null ? (_ref = window.crypto) != null ? _ref.getRandomValues : void 0 : void 0) != null) {
    _native_rng = browser_rng;
  } else {
    try {
      rng = require('cry' + 'pto').rng;
      if (rng != null) {
        _native_rng = rng;
      }
    } catch (_error) {
      e = _error;
    }
  }

  native_rng = function(x) {
    if (_native_rng == null) {
      throw new Error('No rng found; tried requiring "crypto" and window.crypto');
    }
    return _native_rng(x);
  };

  PRNG = (function() {
    function PRNG() {
      var _this = this;
      this.meg = new more_entropy.Generator();
      this.adrbg = new ADRBG((function(n, cb) {
        return _this.gen_seed(n, cb);
      }), XOR.sign);
    }

    PRNG.prototype.now_to_buffer = function() {
      var buf, d, ms, s;
      d = Date.now();
      ms = d % 1000;
      s = Math.floor(d / 1000);
      buf = new Buffer(8);
      buf.writeUInt32BE(s, 0);
      buf.writeUInt32BE(ms, 4);
      return buf;
    };

    PRNG.prototype.gen_seed = function(nbits, cb) {
      var b, bufs, cat, nbytes, wa, words, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      nbytes = nbits / 8;
      bufs = [];
      bufs.push(this.now_to_buffer());
      (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral,
          filename: "src/prng.iced",
          funcname: "PRNG.gen_seed"
        });
        _this.meg.generate(nbits, __iced_deferrals.defer({
          assign_fn: (function() {
            return function() {
              return words = arguments[0];
            };
          })(),
          lineno: 76
        }));
        __iced_deferrals._fulfill();
      })(function() {
        var _i, _len;
        bufs.push(_this.now_to_buffer());
        bufs.push(new Buffer(words));
        bufs.push(native_rng(nbytes));
        bufs.push(_this.now_to_buffer());
        cat = Buffer.concat(bufs);
        wa = WordArray.from_buffer(cat);
        util.scrub_buffer(cat);
        for (_i = 0, _len = bufs.length; _i < _len; _i++) {
          b = bufs[_i];
          util.scrub_buffer(b);
        }
        return cb(wa);
      });
    };

    PRNG.prototype.generate = function(n, cb) {
      return this.adrbg.generate(n, cb);
    };

    return PRNG;

  })();

  _prng = null;

  generate = function(n, cb) {
    if (_prng == null) {
      _prng = new PRNG();
    }
    return _prng.generate(n, cb);
  };

  exports.PRNG = PRNG;

  exports.generate = generate;

  exports.native_rng = native_rng;

}).call(this);

}).call(this,require("buffer").Buffer)
},{"./combine":19,"./drbg":22,"./util":37,"./wordarray":38,"buffer":1,"iced-coffee-script/lib/coffee-script/iced":9,"more-entropy":40}],29:[function(require,module,exports){
(function (Buffer){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var Cipher, Counter, Salsa20, Salsa20Core, Salsa20InnerCore, Salsa20WordStream, StreamCipher, WordArray, asum, bulk_encrypt, encrypt, endian_reverse, fixup_uint32, iced, util, __iced_k, __iced_k_noop, _ref, _ref1, _ref2,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  iced = require('iced-coffee-script/lib/coffee-script/iced').runtime;
  __iced_k = __iced_k_noop = function() {};

  _ref = require('./wordarray'), endian_reverse = _ref.endian_reverse, WordArray = _ref.WordArray;

  Counter = require('./ctr').Counter;

  fixup_uint32 = require('./util').fixup_uint32;

  StreamCipher = require('./algbase').StreamCipher;

  util = require('./util');

  asum = function(out, v) {
    var e, i, _i, _len;
    for (i = _i = 0, _len = v.length; _i < _len; i = ++_i) {
      e = v[i];
      out[i] += e;
    }
    return false;
  };

  Salsa20InnerCore = (function() {
    function Salsa20InnerCore(rounds) {
      this.rounds = rounds;
    }

    Salsa20InnerCore.prototype._core = function(v) {
      "use asm";
      var i, u, x0, x1, x10, x11, x12, x13, x14, x15, x2, x3, x4, x5, x6, x7, x8, x9, _i, _ref1;
      x0 = v[0], x1 = v[1], x2 = v[2], x3 = v[3], x4 = v[4], x5 = v[5], x6 = v[6], x7 = v[7], x8 = v[8], x9 = v[9], x10 = v[10], x11 = v[11], x12 = v[12], x13 = v[13], x14 = v[14], x15 = v[15];
      for (i = _i = 0, _ref1 = this.rounds; _i < _ref1; i = _i += 2) {
        u = (x0 + x12) | 0;
        x4 ^= (u << 7) | (u >>> 25);
        u = (x4 + x0) | 0;
        x8 ^= (u << 9) | (u >>> 23);
        u = (x8 + x4) | 0;
        x12 ^= (u << 13) | (u >>> 19);
        u = (x12 + x8) | 0;
        x0 ^= (u << 18) | (u >>> 14);
        u = (x5 + x1) | 0;
        x9 ^= (u << 7) | (u >>> 25);
        u = (x9 + x5) | 0;
        x13 ^= (u << 9) | (u >>> 23);
        u = (x13 + x9) | 0;
        x1 ^= (u << 13) | (u >>> 19);
        u = (x1 + x13) | 0;
        x5 ^= (u << 18) | (u >>> 14);
        u = (x10 + x6) | 0;
        x14 ^= (u << 7) | (u >>> 25);
        u = (x14 + x10) | 0;
        x2 ^= (u << 9) | (u >>> 23);
        u = (x2 + x14) | 0;
        x6 ^= (u << 13) | (u >>> 19);
        u = (x6 + x2) | 0;
        x10 ^= (u << 18) | (u >>> 14);
        u = (x15 + x11) | 0;
        x3 ^= (u << 7) | (u >>> 25);
        u = (x3 + x15) | 0;
        x7 ^= (u << 9) | (u >>> 23);
        u = (x7 + x3) | 0;
        x11 ^= (u << 13) | (u >>> 19);
        u = (x11 + x7) | 0;
        x15 ^= (u << 18) | (u >>> 14);
        u = (x0 + x3) | 0;
        x1 ^= (u << 7) | (u >>> 25);
        u = (x1 + x0) | 0;
        x2 ^= (u << 9) | (u >>> 23);
        u = (x2 + x1) | 0;
        x3 ^= (u << 13) | (u >>> 19);
        u = (x3 + x2) | 0;
        x0 ^= (u << 18) | (u >>> 14);
        u = (x5 + x4) | 0;
        x6 ^= (u << 7) | (u >>> 25);
        u = (x6 + x5) | 0;
        x7 ^= (u << 9) | (u >>> 23);
        u = (x7 + x6) | 0;
        x4 ^= (u << 13) | (u >>> 19);
        u = (x4 + x7) | 0;
        x5 ^= (u << 18) | (u >>> 14);
        u = (x10 + x9) | 0;
        x11 ^= (u << 7) | (u >>> 25);
        u = (x11 + x10) | 0;
        x8 ^= (u << 9) | (u >>> 23);
        u = (x8 + x11) | 0;
        x9 ^= (u << 13) | (u >>> 19);
        u = (x9 + x8) | 0;
        x10 ^= (u << 18) | (u >>> 14);
        u = (x15 + x14) | 0;
        x12 ^= (u << 7) | (u >>> 25);
        u = (x12 + x15) | 0;
        x13 ^= (u << 9) | (u >>> 23);
        u = (x13 + x12) | 0;
        x14 ^= (u << 13) | (u >>> 19);
        u = (x14 + x13) | 0;
        x15 ^= (u << 18) | (u >>> 14);
      }
      return [x0, x1, x2, x3, x4, x5, x6, x7, x8, x9, x10, x11, x12, x13, x14, x15];
    };

    return Salsa20InnerCore;

  })();

  Salsa20Core = (function(_super) {
    __extends(Salsa20Core, _super);

    Salsa20Core.prototype.sigma = WordArray.from_buffer_le(new Buffer("expand 32-byte k"));

    Salsa20Core.prototype.tau = WordArray.from_buffer_le(new Buffer("expand 16-byte k"));

    Salsa20Core.blockSize = 64;

    Salsa20Core.prototype.blockSize = Salsa20Core.blockSize;

    Salsa20Core.keySize = 32;

    Salsa20Core.prototype.keySize = Salsa20Core.keySize;

    Salsa20Core.ivSize = 192 / 8;

    Salsa20Core.prototype.ivSize = Salsa20Core.ivSize;

    function Salsa20Core(key, nonce) {
      var _ref1;
      Salsa20Core.__super__.constructor.call(this, 20);
      this.key = key.clone().endian_reverse();
      this.nonce = nonce.clone().endian_reverse();
      if (!(((this.key.sigBytes === 16) && (this.nonce.sigBytes === 8)) || ((this.key.sigBytes === 32) && ((_ref1 = this.nonce.sigBytes) === 8 || _ref1 === 24)))) {
        throw new Error("Bad key/nonce lengths");
      }
      if (this.nonce.sigBytes === 24) {
        this.xsalsa_setup();
      }
      this.input = this.key_iv_setup(this.nonce, this.key);
      this._reset();
    }

    Salsa20Core.prototype.scrub = function() {
      this.key.scrub();
      this.nonce.scrub();
      return util.scrub_vec(this.input);
    };

    Salsa20Core.prototype.xsalsa_setup = function() {
      var n0, n1;
      n0 = new WordArray(this.nonce.words.slice(0, 4));
      this.nonce = n1 = new WordArray(this.nonce.words.slice(4));
      return this.key = this.hsalsa20(n0, this.key);
    };

    Salsa20Core.prototype.hsalsa20 = function(nonce, key) {
      var i, indexes, input, v;
      input = this.key_iv_setup(nonce, key);
      input[8] = nonce.words[2];
      input[9] = nonce.words[3];
      v = this._core(input);
      indexes = [0, 5, 10, 15, 6, 7, 8, 9];
      v = (function() {
        var _i, _len, _results;
        _results = [];
        for (_i = 0, _len = indexes.length; _i < _len; _i++) {
          i = indexes[_i];
          _results.push(fixup_uint32(v[i]));
        }
        return _results;
      })();
      util.scrub_vec(input);
      return new WordArray(v);
    };

    Salsa20Core.prototype.key_iv_setup = function(nonce, key) {
      var A, C, i, out, _i, _j, _k, _ref1;
      out = [];
      for (i = _i = 0; _i < 4; i = ++_i) {
        out[i + 1] = key.words[i];
      }
      _ref1 = key.sigBytes === 32 ? [this.sigma, key.words.slice(4)] : [this.tau, key.words], C = _ref1[0], A = _ref1[1];
      for (i = _j = 0; _j < 4; i = ++_j) {
        out[i + 11] = A[i];
      }
      for (i = _k = 0; _k < 4; i = ++_k) {
        out[i * 5] = C.words[i];
      }
      out[6] = nonce.words[0];
      out[7] = nonce.words[1];
      return out;
    };

    Salsa20Core.prototype.counter_setup = function() {
      this.input[8] = this.counter.get().words[0];
      return this.input[9] = this.counter.get().words[1];
    };

    Salsa20Core.prototype._reset = function() {
      return this.counter = new Counter({
        len: 2
      });
    };

    Salsa20Core.prototype._generateBlock = function() {
      var v;
      this.counter_setup();
      v = this._core(this.input);
      asum(v, this.input);
      this.counter.inc_le();
      return v;
    };

    return Salsa20Core;

  })(Salsa20InnerCore);

  exports.Salsa20WordStream = Salsa20WordStream = (function(_super) {
    __extends(Salsa20WordStream, _super);

    function Salsa20WordStream() {
      _ref1 = Salsa20WordStream.__super__.constructor.apply(this, arguments);
      return _ref1;
    }

    Salsa20WordStream.prototype._reset = function() {
      return Salsa20WordStream.__super__._reset.call(this);
    };

    Salsa20WordStream.prototype.getWordArray = function(nbytes) {
      var blocks, i, nblocks, w, words, _i, _len, _ref2;
      if ((nbytes == null) || nbytes === this.blockSize) {
        words = this._generateBlock();
      } else {
        nblocks = Math.ceil(nbytes / this.blockSize);
        blocks = (function() {
          var _i, _results;
          _results = [];
          for (i = _i = 0; 0 <= nblocks ? _i < nblocks : _i > nblocks; i = 0 <= nblocks ? ++_i : --_i) {
            _results.push(this._generateBlock());
          }
          return _results;
        }).call(this);
        words = (_ref2 = []).concat.apply(_ref2, blocks);
      }
      for (i = _i = 0, _len = words.length; _i < _len; i = ++_i) {
        w = words[i];
        words[i] = endian_reverse(w);
      }
      return new WordArray(words, nbytes);
    };

    return Salsa20WordStream;

  })(Salsa20Core);

  exports.Salsa20 = Salsa20 = (function(_super) {
    __extends(Salsa20, _super);

    function Salsa20() {
      _ref2 = Salsa20.__super__.constructor.apply(this, arguments);
      return _ref2;
    }

    Salsa20.prototype._reset = function() {
      Salsa20.__super__._reset.call(this);
      return this._i = this.blockSize;
    };

    Salsa20.prototype.getBytes = function(needed) {
      var bsz, n, v;
      if (needed == null) {
        needed = this.blockSize;
      }
      v = [];
      bsz = this.blockSize;
      if ((this._i === bsz) && (needed === bsz)) {
        return this._generateBlockBuffer();
      } else {
        while (needed > 0) {
          if (this._i === bsz) {
            this._generateBlockBuffer();
            this._i = 0;
          }
          n = Math.min(needed, bsz - this._i);
          v.push((n === bsz ? this._buf : this._buf.slice(this._i, this._i + n)));
          this._i += n;
          needed -= n;
        }
        return Buffer.concat(v);
      }
    };

    Salsa20.prototype._generateBlockBuffer = function() {
      var e, i, v, _i, _len;
      this._buf = new Buffer(this.blockSize);
      v = this._generateBlock();
      for (i = _i = 0, _len = v.length; _i < _len; i = ++_i) {
        e = v[i];
        this._buf.writeUInt32LE(fixup_uint32(e), i * 4);
      }
      return this._buf;
    };

    return Salsa20;

  })(Salsa20Core);

  exports.Cipher = Cipher = (function(_super) {
    __extends(Cipher, _super);

    function Cipher(_arg) {
      var iv, key;
      key = _arg.key, iv = _arg.iv;
      Cipher.__super__.constructor.call(this);
      this.salsa = new Salsa20WordStream(key, iv);
      this.bsiw = this.salsa.blockSize / 4;
    }

    Cipher.prototype.scrub = function() {
      return this.salsa.scrub();
    };

    Cipher.prototype.get_pad = function() {
      var pad;
      pad = this.salsa.getWordArray();
      return pad;
    };

    return Cipher;

  })(StreamCipher);

  exports.encrypt = encrypt = function(_arg) {
    var cipher, input, iv, key, ret;
    key = _arg.key, iv = _arg.iv, input = _arg.input;
    cipher = new Cipher({
      key: key,
      iv: iv
    });
    ret = cipher.encrypt(input);
    cipher.scrub();
    return ret;
  };

  exports.bulk_encrypt = bulk_encrypt = function(_arg, cb) {
    var cipher, input, iv, key, progress_hook, ret, ___iced_passed_deferral, __iced_deferrals, __iced_k,
      _this = this;
    __iced_k = __iced_k_noop;
    ___iced_passed_deferral = iced.findDeferral(arguments);
    key = _arg.key, iv = _arg.iv, input = _arg.input, progress_hook = _arg.progress_hook;
    cipher = new Cipher({
      key: key,
      iv: iv
    });
    (function(__iced_k) {
      __iced_deferrals = new iced.Deferrals(__iced_k, {
        parent: ___iced_passed_deferral,
        filename: "src/salsa20.iced",
        funcname: "bulk_encrypt"
      });
      cipher.bulk_encrypt({
        input: input,
        progress_hook: progress_hook,
        what: "salsa20"
      }, __iced_deferrals.defer({
        assign_fn: (function() {
          return function() {
            return ret = arguments[0];
          };
        })(),
        lineno: 257
      }));
      __iced_deferrals._fulfill();
    })(function() {
      cipher.scrub();
      return cb(ret);
    });
  };

  exports.Salsa20InnerCore = Salsa20InnerCore;

  exports.endian_reverse = endian_reverse;

  exports.asum = asum;

}).call(this);

}).call(this,require("buffer").Buffer)
},{"./algbase":18,"./ctr":20,"./util":37,"./wordarray":38,"buffer":1,"iced-coffee-script/lib/coffee-script/iced":9}],30:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var HMAC_SHA256, Salsa20InnerCore, Scrypt, WordArray, blkcpy, blkxor, default_delay, endian_reverse, fixup_uint32, iced, pbkdf2, scrub_vec, scrypt, ui8a_to_buffer, v_endian_reverse, __iced_k, __iced_k_noop, _ref, _ref1, _ref2;

  iced = require('iced-coffee-script/lib/coffee-script/iced').runtime;
  __iced_k = __iced_k_noop = function() {};

  HMAC_SHA256 = require('./hmac').HMAC_SHA256;

  pbkdf2 = require('./pbkdf2').pbkdf2;

  _ref = require('./salsa20'), endian_reverse = _ref.endian_reverse, Salsa20InnerCore = _ref.Salsa20InnerCore;

  _ref1 = require('./wordarray'), ui8a_to_buffer = _ref1.ui8a_to_buffer, WordArray = _ref1.WordArray;

  _ref2 = require('./util'), fixup_uint32 = _ref2.fixup_uint32, default_delay = _ref2.default_delay, scrub_vec = _ref2.scrub_vec;

  blkcpy = function(D, S, d_offset, s_offset, len) {
    "use asm";
    var end, i, j;
    j = (d_offset << 4) | 0;
    i = (s_offset << 4) | 0;
    end = (i + (len << 4)) | 0;
    while (i < end) {
      D[j] = S[i];
      D[j + 1] = S[i + 1];
      D[j + 2] = S[i + 2];
      D[j + 3] = S[i + 3];
      D[j + 4] = S[i + 4];
      D[j + 5] = S[i + 5];
      D[j + 6] = S[i + 6];
      D[j + 7] = S[i + 7];
      D[j + 8] = S[i + 8];
      D[j + 9] = S[i + 9];
      D[j + 10] = S[i + 10];
      D[j + 11] = S[i + 11];
      D[j + 12] = S[i + 12];
      D[j + 13] = S[i + 13];
      D[j + 14] = S[i + 14];
      D[j + 15] = S[i + 15];
      i += 16;
      j += 16;
    }
    return true;
  };

  blkxor = function(D, S, s_offset, len) {
    "use asm";
    var i, j;
    len = (len << 4) | 0;
    i = 0;
    j = (s_offset << 4) | 0;
    while (i < len) {
      D[i] ^= S[j];
      D[i + 1] ^= S[j + 1];
      D[i + 2] ^= S[j + 2];
      D[i + 3] ^= S[j + 3];
      D[i + 4] ^= S[j + 4];
      D[i + 5] ^= S[j + 5];
      D[i + 6] ^= S[j + 6];
      D[i + 7] ^= S[j + 7];
      D[i + 8] ^= S[j + 8];
      D[i + 9] ^= S[j + 9];
      D[i + 10] ^= S[j + 10];
      D[i + 11] ^= S[j + 11];
      D[i + 12] ^= S[j + 12];
      D[i + 13] ^= S[j + 13];
      D[i + 14] ^= S[j + 14];
      D[i + 15] ^= S[j + 15];
      i += 16;
      j += 16;
    }
    return true;
  };

  v_endian_reverse = function(v) {
    var e, i, _i, _len;
    for (i = _i = 0, _len = v.length; _i < _len; i = ++_i) {
      e = v[i];
      v[i] = endian_reverse(e);
    }
    return true;
  };

  Scrypt = (function() {
    function Scrypt(_arg) {
      var N, c, c0, c1;
      N = _arg.N, this.r = _arg.r, this.p = _arg.p, c = _arg.c, c0 = _arg.c0, c1 = _arg.c1, this.klass = _arg.klass;
      this.N || (this.N = 1 << (N || 10));
      this.r || (this.r = 16);
      this.p || (this.p = 2);
      this.c0 = c0 || c || 1;
      this.c1 = c1 || c || 1;
      this.klass || (this.klass = HMAC_SHA256);
      this.X16_tmp = new Int32Array(0x10);
      this.s20ic = new Salsa20InnerCore(8);
    }

    Scrypt.prototype.salsa20_8 = function(B) {
      var X, i, x, _i, _len;
      X = this.s20ic._core(B);
      for (i = _i = 0, _len = X.length; _i < _len; i = ++_i) {
        x = X[i];
        B[i] += x;
      }
      return true;
    };

    Scrypt.prototype.pbkdf2 = function(_arg, cb) {
      var c, dkLen, key, progress_hook, salt, wa, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      key = _arg.key, salt = _arg.salt, dkLen = _arg.dkLen, progress_hook = _arg.progress_hook, c = _arg.c;
      (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral,
          filename: "src/scrypt.iced",
          funcname: "Scrypt.pbkdf2"
        });
        pbkdf2({
          key: key,
          salt: salt,
          c: c,
          dkLen: dkLen,
          klass: _this.klass,
          progress_hook: progress_hook
        }, __iced_deferrals.defer({
          assign_fn: (function() {
            return function() {
              return wa = arguments[0];
            };
          })(),
          lineno: 103
        }));
        __iced_deferrals._fulfill();
      })(function() {
        return cb(wa);
      });
    };

    Scrypt.prototype.blockmix_salsa8 = function(B, Y) {
      var X, i, _i, _j, _k, _ref3, _ref4, _ref5;
      X = this.X16_tmp;
      blkcpy(X, B, 0, 2 * this.r - 1, 1);
      for (i = _i = 0, _ref3 = 2 * this.r; 0 <= _ref3 ? _i < _ref3 : _i > _ref3; i = 0 <= _ref3 ? ++_i : --_i) {
        blkxor(X, B, i, 1);
        this.salsa20_8(X);
        blkcpy(Y, X, i, 0, 1);
      }
      for (i = _j = 0, _ref4 = this.r; 0 <= _ref4 ? _j < _ref4 : _j > _ref4; i = 0 <= _ref4 ? ++_j : --_j) {
        blkcpy(B, Y, i, i * 2, 1);
      }
      for (i = _k = 0, _ref5 = this.r; 0 <= _ref5 ? _k < _ref5 : _k > _ref5; i = 0 <= _ref5 ? ++_k : --_k) {
        blkcpy(B, Y, i + this.r, i * 2 + 1, 1);
      }
      return true;
    };

    Scrypt.prototype.smix = function(_arg, cb) {
      var B, V, X, XY, Y, i, j, lim, progress_hook, stop, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      B = _arg.B, V = _arg.V, XY = _arg.XY, progress_hook = _arg.progress_hook;
      X = XY;
      lim = 2 * this.r;
      Y = XY.subarray(0x10 * lim);
      blkcpy(X, B, 0, 0, lim);
      i = 0;
      (function(__iced_k) {
        var _results, _while;
        _results = [];
        _while = function(__iced_k) {
          var _break, _continue, _next;
          _break = function() {
            return __iced_k(_results);
          };
          _continue = function() {
            return iced.trampoline(function() {
              return _while(__iced_k);
            });
          };
          _next = function(__iced_next_arg) {
            _results.push(__iced_next_arg);
            return _continue();
          };
          if (!(i < _this.N)) {
            return _break();
          } else {
            stop = Math.min(_this.N, i + 2048);
            while (i < stop) {
              blkcpy(V, X, lim * i, 0, lim);
              _this.blockmix_salsa8(X, Y);
              i++;
            }
            if (typeof progress_hook === "function") {
              progress_hook(i);
            }
            (function(__iced_k) {
              __iced_deferrals = new iced.Deferrals(__iced_k, {
                parent: ___iced_passed_deferral,
                filename: "src/scrypt.iced",
                funcname: "Scrypt.smix"
              });
              default_delay(0, 0, __iced_deferrals.defer({
                lineno: 156
              }));
              __iced_deferrals._fulfill();
            })(_next);
          }
        };
        _while(__iced_k);
      })(function() {
        i = 0;
        (function(__iced_k) {
          var _results, _while;
          _results = [];
          _while = function(__iced_k) {
            var _break, _continue, _next;
            _break = function() {
              return __iced_k(_results);
            };
            _continue = function() {
              return iced.trampoline(function() {
                return _while(__iced_k);
              });
            };
            _next = function(__iced_next_arg) {
              _results.push(__iced_next_arg);
              return _continue();
            };
            if (!(i < _this.N)) {
              return _break();
            } else {
              stop = Math.min(_this.N, i + 256);
              while (i < stop) {
                j = fixup_uint32(X[0x10 * (lim - 1)]) & (_this.N - 1);
                blkxor(X, V, j * lim, lim);
                _this.blockmix_salsa8(X, Y);
                i++;
              }
              if (typeof progress_hook === "function") {
                progress_hook(i + _this.N);
              }
              (function(__iced_k) {
                __iced_deferrals = new iced.Deferrals(__iced_k, {
                  parent: ___iced_passed_deferral,
                  filename: "src/scrypt.iced",
                  funcname: "Scrypt.smix"
                });
                default_delay(0, 0, __iced_deferrals.defer({
                  lineno: 173
                }));
                __iced_deferrals._fulfill();
              })(_next);
            }
          };
          _while(__iced_k);
        })(function() {
          blkcpy(B, X, 0, 0, lim);
          return cb();
        });
      });
    };

    Scrypt.prototype.run = function(_arg, cb) {
      var B, MAX, V, XY, dkLen, err, j, key, lph, out, progress_hook, ret, salt, ___iced_passed_deferral, __iced_deferrals, __iced_k,
        _this = this;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      key = _arg.key, salt = _arg.salt, dkLen = _arg.dkLen, progress_hook = _arg.progress_hook;
      MAX = 0xffffffff;
      err = ret = null;
      err = dkLen > MAX ? err = new Error("asked for too much data") : this.r * this.p >= (1 << 30) ? new Error("r & p are too big") : (this.r > MAX / 128 / this.p) || (this.r > MAX / 256) || (this.N > MAX / 128 / this.r) ? new Error("N is too big") : null;
      XY = new Int32Array(64 * this.r);
      V = new Int32Array(32 * this.r * this.N);
      lph = function(o) {
        o.what += " (pass 1)";
        return typeof progress_hook === "function" ? progress_hook(o) : void 0;
      };
      (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral,
          filename: "src/scrypt.iced",
          funcname: "Scrypt.run"
        });
        _this.pbkdf2({
          key: key.clone(),
          salt: salt,
          dkLen: 128 * _this.r * _this.p,
          c: _this.c0,
          progress_hook: lph
        }, __iced_deferrals.defer({
          assign_fn: (function() {
            return function() {
              return B = arguments[0];
            };
          })(),
          lineno: 204
        }));
        __iced_deferrals._fulfill();
      })(function() {
        B = new Int32Array(B.words);
        v_endian_reverse(B);
        lph = function(j) {
          return function(i) {
            return typeof progress_hook === "function" ? progress_hook({
              i: i + j * _this.N * 2,
              what: "scrypt",
              total: _this.p * _this.N * 2
            }) : void 0;
          };
        };
        (function(__iced_k) {
          var _i, _results, _while;
          j = 0;
          _results = [];
          _while = function(__iced_k) {
            var _break, _continue, _next;
            _break = function() {
              return __iced_k(_results);
            };
            _continue = function() {
              return iced.trampoline(function() {
                ++j;
                return _while(__iced_k);
              });
            };
            _next = function(__iced_next_arg) {
              _results.push(__iced_next_arg);
              return _continue();
            };
            if (!(j < _this.p)) {
              return _break();
            } else {

              (function(__iced_k) {
                __iced_deferrals = new iced.Deferrals(__iced_k, {
                  parent: ___iced_passed_deferral,
                  filename: "src/scrypt.iced",
                  funcname: "Scrypt.run"
                });
                _this.smix({
                  B: B.subarray(32 * _this.r * j),
                  V: V,
                  XY: XY,
                  progress_hook: lph(j)
                }, __iced_deferrals.defer({
                  lineno: 211
                }));
                __iced_deferrals._fulfill();
              })(_next);
            }
          };
          _while(__iced_k);
        })(function() {
          v_endian_reverse(B);
          lph = function(o) {
            o.what += " (pass 2)";
            return typeof progress_hook === "function" ? progress_hook(o) : void 0;
          };
          (function(__iced_k) {
            __iced_deferrals = new iced.Deferrals(__iced_k, {
              parent: ___iced_passed_deferral,
              filename: "src/scrypt.iced",
              funcname: "Scrypt.run"
            });
            _this.pbkdf2({
              key: key,
              salt: WordArray.from_i32a(B),
              dkLen: dkLen,
              c: _this.c1,
              progress_hook: lph
            }, __iced_deferrals.defer({
              assign_fn: (function() {
                return function() {
                  return out = arguments[0];
                };
              })(),
              lineno: 219
            }));
            __iced_deferrals._fulfill();
          })(function() {
            scrub_vec(XY);
            scrub_vec(V);
            scrub_vec(B);
            key.scrub();
            return cb(out);
          });
        });
      });
    };

    return Scrypt;

  })();

  scrypt = function(_arg, cb) {
    var N, c, c0, c1, dkLen, eng, key, klass, p, progress_hook, r, salt, wa, ___iced_passed_deferral, __iced_deferrals, __iced_k,
      _this = this;
    __iced_k = __iced_k_noop;
    ___iced_passed_deferral = iced.findDeferral(arguments);
    key = _arg.key, salt = _arg.salt, r = _arg.r, N = _arg.N, p = _arg.p, c0 = _arg.c0, c1 = _arg.c1, c = _arg.c, klass = _arg.klass, progress_hook = _arg.progress_hook, dkLen = _arg.dkLen;
    eng = new Scrypt({
      r: r,
      N: N,
      p: p,
      c: c,
      c0: c0,
      c1: c1,
      klass: klass
    });
    (function(__iced_k) {
      __iced_deferrals = new iced.Deferrals(__iced_k, {
        parent: ___iced_passed_deferral,
        filename: "src/scrypt.iced",
        funcname: "scrypt"
      });
      eng.run({
        key: key,
        salt: salt,
        progress_hook: progress_hook,
        dkLen: dkLen
      }, __iced_deferrals.defer({
        assign_fn: (function() {
          return function() {
            return wa = arguments[0];
          };
        })(),
        lineno: 249
      }));
      __iced_deferrals._fulfill();
    })(function() {
      return cb(wa);
    });
  };

  exports.Scrypt = Scrypt;

  exports.scrypt = scrypt;

  exports.v_endian_reverse = v_endian_reverse;

}).call(this);

},{"./hmac":24,"./pbkdf2":27,"./salsa20":29,"./util":37,"./wordarray":38,"iced-coffee-script/lib/coffee-script/iced":9}],31:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var Hasher, SHA1, W, WordArray, transform, _ref,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };



  WordArray = require('./wordarray').WordArray;

  Hasher = require('./algbase').Hasher;

  W = [];

  SHA1 = (function(_super) {
    __extends(SHA1, _super);

    function SHA1() {
      _ref = SHA1.__super__.constructor.apply(this, arguments);
      return _ref;
    }

    SHA1.blockSize = 512 / 32;

    SHA1.prototype.blockSize = SHA1.blockSize;

    SHA1.output_size = 20;

    SHA1.prototype.output_size = SHA1.output_size;

    SHA1.prototype._doReset = function() {
      return this._hash = new WordArray([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]);
    };

    SHA1.prototype._doProcessBlock = function(M, offset) {
      var H, a, b, c, d, e, i, n, t, _i;
      H = this._hash.words;
      a = H[0];
      b = H[1];
      c = H[2];
      d = H[3];
      e = H[4];
      for (i = _i = 0; _i < 80; i = ++_i) {
        if (i < 16) {
          W[i] = M[offset + i] | 0;
        } else {
          n = W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16];
          W[i] = (n << 1) | (n >>> 31);
        }
        t = ((a << 5) | (a >>> 27)) + e + W[i];
        if (i < 20) {
          t += ((b & c) | (~b & d)) + 0x5a827999;
        } else if (i < 40) {
          t += (b ^ c ^ d) + 0x6ed9eba1;
        } else if (i < 60) {
          t += ((b & c) | (b & d) | (c & d)) - 0x70e44324;
        } else {
          t += (b ^ c ^ d) - 0x359d3e2a;
        }
        e = d;
        d = c;
        c = (b << 30) | (b >>> 2);
        b = a;
        a = t;
      }
      H[0] = (H[0] + a) | 0;
      H[1] = (H[1] + b) | 0;
      H[2] = (H[2] + c) | 0;
      H[3] = (H[3] + d) | 0;
      return H[4] = (H[4] + e) | 0;
    };

    SHA1.prototype._doFinalize = function() {
      var data, dataWords, nBitsLeft, nBitsTotal;
      data = this._data;
      dataWords = data.words;
      nBitsTotal = this._nDataBytes * 8;
      nBitsLeft = data.sigBytes * 8;
      dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - nBitsLeft % 32);
      dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] = Math.floor(nBitsTotal / 0x100000000);
      dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] = nBitsTotal;
      data.sigBytes = dataWords.length * 4;
      this._process();
      return this._hash;
    };

    SHA1.prototype.copy_to = function(obj) {
      SHA1.__super__.copy_to.call(this, obj);
      return obj._hash = this._hash.clone();
    };

    SHA1.prototype.clone = function() {
      var out;
      out = new SHA1();
      this.copy_to(out);
      return out;
    };

    return SHA1;

  })(Hasher);

  transform = transform = function(x) {
    var out;
    out = (new SHA1).finalize(x);
    x.scrub();
    return out;
  };

  exports.SHA1 = SHA1;

  exports.transform = transform;

}).call(this);

},{"./algbase":18,"./wordarray":38}],32:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var SHA224, SHA256, WordArray, transform, _ref,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };



  WordArray = require('./wordarray').WordArray;

  SHA256 = require('./sha256').SHA256;

  SHA224 = (function(_super) {
    __extends(SHA224, _super);

    function SHA224() {
      _ref = SHA224.__super__.constructor.apply(this, arguments);
      return _ref;
    }

    SHA224.prototype._doReset = function() {
      return this._hash = new WordArray([0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4]);
    };

    SHA224.prototype._doFinalize = function() {
      var hash;
      hash = SHA224.__super__._doFinalize.call(this);
      hash.sigBytes -= 4;
      return hash;
    };

    SHA224.prototype.clone = function() {
      var out;
      out = new SHA224();
      this.copy_to(out);
      return out;
    };

    return SHA224;

  })(SHA256);

  transform = function(x) {
    var out;
    out = (new SHA224).finalize(x);
    x.scrub();
    return out;
  };

  exports.SHA224 = SHA224;

  exports.transform = transform;

}).call(this);

},{"./sha256":33,"./wordarray":38}],33:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var Global, Hasher, SHA256, WordArray, glbl, transform, _ref,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };



  WordArray = require('./wordarray').WordArray;

  Hasher = require('./algbase').Hasher;

  Global = (function() {
    function Global() {
      this.H = [];
      this.K = [];
      this.W = [];
      this.init();
    }

    Global.prototype.isPrime = function(n) {
      var f, sqn, _i;
      if (n === 2 || n === 3 || n === 5 || n === 7) {
        return true;
      }
      if (n === 1 || n === 4 || n === 6 || n === 8 || n === 9) {
        return false;
      }
      sqn = Math.ceil(Math.sqrt(n));
      for (f = _i = 2; 2 <= sqn ? _i <= sqn : _i >= sqn; f = 2 <= sqn ? ++_i : --_i) {
        if ((n % f) === 0) {
          return false;
        }
      }
      return true;
    };

    Global.prototype.getFractionalBits = function(n) {
      return ((n - (n | 0)) * 0x100000000) | 0;
    };

    Global.prototype.init = function() {
      var n, nPrime, _results;
      n = 2;
      nPrime = 0;
      _results = [];
      while (nPrime < 64) {
        if (this.isPrime(n)) {
          if (nPrime < 8) {
            this.H[nPrime] = this.getFractionalBits(Math.pow(n, 1 / 2));
          }
          this.K[nPrime] = this.getFractionalBits(Math.pow(n, 1 / 3));
          nPrime++;
        }
        _results.push(n++);
      }
      return _results;
    };

    return Global;

  })();

  glbl = new Global();

  SHA256 = (function(_super) {
    __extends(SHA256, _super);

    function SHA256() {
      _ref = SHA256.__super__.constructor.apply(this, arguments);
      return _ref;
    }

    SHA256.blockSize = 512 / 32;

    SHA256.prototype.blockSize = SHA256.blockSize;

    SHA256.output_size = 256 / 8;

    SHA256.prototype.output_size = SHA256.output_size;

    SHA256.prototype._doReset = function() {
      return this._hash = new WordArray(glbl.H.slice(0));
    };

    SHA256.prototype.get_output_size = function() {
      return this.output_size;
    };

    SHA256.prototype._doProcessBlock = function(M, offset) {
      var H, K, W, a, b, c, ch, d, e, f, g, gamma0, gamma0x, gamma1, gamma1x, h, i, maj, sigma0, sigma1, t1, t2, _i;
      H = this._hash.words;
      W = glbl.W;
      K = glbl.K;
      a = H[0];
      b = H[1];
      c = H[2];
      d = H[3];
      e = H[4];
      f = H[5];
      g = H[6];
      h = H[7];
      for (i = _i = 0; _i < 64; i = ++_i) {
        if (i < 16) {
          W[i] = M[offset + i] | 0;
        } else {
          gamma0x = W[i - 15];
          gamma0 = ((gamma0x << 25) | (gamma0x >>> 7)) ^ ((gamma0x << 14) | (gamma0x >>> 18)) ^ (gamma0x >>> 3);
          gamma1x = W[i - 2];
          gamma1 = ((gamma1x << 15) | (gamma1x >>> 17)) ^ ((gamma1x << 13) | (gamma1x >>> 19)) ^ (gamma1x >>> 10);
          W[i] = gamma0 + W[i - 7] + gamma1 + W[i - 16];
        }
        ch = (e & f) ^ (~e & g);
        maj = (a & b) ^ (a & c) ^ (b & c);
        sigma0 = ((a << 30) | (a >>> 2)) ^ ((a << 19) | (a >>> 13)) ^ ((a << 10) | (a >>> 22));
        sigma1 = ((e << 26) | (e >>> 6)) ^ ((e << 21) | (e >>> 11)) ^ ((e << 7) | (e >>> 25));
        t1 = h + sigma1 + ch + K[i] + W[i];
        t2 = sigma0 + maj;
        h = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0;
      H[1] = (H[1] + b) | 0;
      H[2] = (H[2] + c) | 0;
      H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0;
      H[5] = (H[5] + f) | 0;
      H[6] = (H[6] + g) | 0;
      return H[7] = (H[7] + h) | 0;
    };

    SHA256.prototype._doFinalize = function() {
      var data, dataWords, nBitsLeft, nBitsTotal;
      data = this._data;
      dataWords = data.words;
      nBitsTotal = this._nDataBytes * 8;
      nBitsLeft = data.sigBytes * 8;
      dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - nBitsLeft % 32);
      dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] = Math.floor(nBitsTotal / 0x100000000);
      dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] = nBitsTotal;
      data.sigBytes = dataWords.length * 4;
      this._process();
      return this._hash;
    };

    SHA256.prototype.scrub = function() {
      return this._hash.scrub();
    };

    SHA256.prototype.copy_to = function(obj) {
      SHA256.__super__.copy_to.call(this, obj);
      return obj._hash = this._hash.clone();
    };

    SHA256.prototype.clone = function() {
      var out;
      out = new SHA256();
      this.copy_to(out);
      return out;
    };

    return SHA256;

  })(Hasher);

  transform = function(x) {
    var out;
    out = (new SHA256).finalize(x);
    x.scrub();
    return out;
  };

  exports.SHA256 = SHA256;

  exports.transform = transform;

}).call(this);

},{"./algbase":18,"./wordarray":38}],34:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var Global, Hasher, SHA3, WordArray, X64Word, X64WordArray, glbl, _ref, _ref1,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };



  _ref = require('./wordarray'), WordArray = _ref.WordArray, X64Word = _ref.X64Word, X64WordArray = _ref.X64WordArray;

  Hasher = require('./algbase').Hasher;

  Global = (function() {
    function Global() {
      this.RHO_OFFSETS = [];
      this.PI_INDEXES = [];
      this.ROUND_CONSTANTS = [];
      this.T = [];
      this.compute_rho_offsets();
      this.compute_pi_indexes();
      this.compute_round_constants();
      this.make_reusables();
    }

    Global.prototype.compute_rho_offsets = function() {
      var newX, newY, t, x, y, _i, _results;
      x = 1;
      y = 0;
      _results = [];
      for (t = _i = 0; _i < 24; t = ++_i) {
        this.RHO_OFFSETS[x + 5 * y] = ((t + 1) * (t + 2) / 2) % 64;
        newX = y % 5;
        newY = (2 * x + 3 * y) % 5;
        x = newX;
        _results.push(y = newY);
      }
      return _results;
    };

    Global.prototype.compute_pi_indexes = function() {
      var x, y, _i, _results;
      _results = [];
      for (x = _i = 0; _i < 5; x = ++_i) {
        _results.push((function() {
          var _j, _results1;
          _results1 = [];
          for (y = _j = 0; _j < 5; y = ++_j) {
            _results1.push(this.PI_INDEXES[x + 5 * y] = y + ((2 * x + 3 * y) % 5) * 5);
          }
          return _results1;
        }).call(this));
      }
      return _results;
    };

    Global.prototype.compute_round_constants = function() {
      var LFSR, bitPosition, i, j, roundConstantLsw, roundConstantMsw, _i, _j, _results;
      LFSR = 0x01;
      _results = [];
      for (i = _i = 0; _i < 24; i = ++_i) {
        roundConstantMsw = 0;
        roundConstantLsw = 0;
        for (j = _j = 0; _j < 7; j = ++_j) {
          if (LFSR & 0x01) {
            bitPosition = (1 << j) - 1;
            if (bitPosition < 32) {
              roundConstantLsw ^= 1 << bitPosition;
            } else {
              roundConstantMsw ^= 1 << (bitPosition - 32);
            }
          }
          if (LFSR & 0x80) {
            LFSR = (LFSR << 1) ^ 0x71;
          } else {
            LFSR <<= 1;
          }
        }
        _results.push(this.ROUND_CONSTANTS[i] = new X64Word(roundConstantMsw, roundConstantLsw));
      }
      return _results;
    };

    Global.prototype.make_reusables = function() {
      var i;
      return this.T = (function() {
        var _i, _results;
        _results = [];
        for (i = _i = 0; _i < 25; i = ++_i) {
          _results.push(new X64Word(0, 0));
        }
        return _results;
      })();
    };

    return Global;

  })();

  glbl = new Global();

  exports.SHA3 = SHA3 = (function(_super) {
    __extends(SHA3, _super);

    function SHA3() {
      _ref1 = SHA3.__super__.constructor.apply(this, arguments);
      return _ref1;
    }

    SHA3.outputLength = 512;

    SHA3.prototype.outputLength = SHA3.outputLength;

    SHA3.blockSize = (1600 - 2 * SHA3.outputLength) / 32;

    SHA3.prototype.blockSize = SHA3.blockSize;

    SHA3.output_size = SHA3.outputLength / 8;

    SHA3.prototype.output_size = SHA3.output_size;

    SHA3.prototype._doReset = function() {
      var i;
      return this._state = (function() {
        var _i, _results;
        _results = [];
        for (i = _i = 0; _i < 25; i = ++_i) {
          _results.push(new X64Word(0, 0));
        }
        return _results;
      })();
    };

    SHA3.prototype._doProcessBlock = function(M, offset) {
      var G, M2i, M2i1, T0, TLane, TPiLane, Tx, Tx1, Tx1Lane, Tx1Lsw, Tx1Msw, Tx2Lane, Tx4, i, lane, laneIndex, laneLsw, laneMsw, nBlockSizeLanes, rhoOffset, round, roundConstant, state, state0, tLsw, tMsw, x, y, _i, _j, _k, _l, _m, _n, _o, _p, _q, _results;
      G = glbl;
      state = this._state;
      nBlockSizeLanes = this.blockSize / 2;
      for (i = _i = 0; 0 <= nBlockSizeLanes ? _i < nBlockSizeLanes : _i > nBlockSizeLanes; i = 0 <= nBlockSizeLanes ? ++_i : --_i) {
        M2i = M[offset + 2 * i];
        M2i1 = M[offset + 2 * i + 1];
        M2i = (((M2i << 8) | (M2i >>> 24)) & 0x00ff00ff) | (((M2i << 24) | (M2i >>> 8)) & 0xff00ff00);
        M2i1 = (((M2i1 << 8) | (M2i1 >>> 24)) & 0x00ff00ff) | (((M2i1 << 24) | (M2i1 >>> 8)) & 0xff00ff00);
        lane = state[i];
        lane.high ^= M2i1;
        lane.low ^= M2i;
      }
      _results = [];
      for (round = _j = 0; _j < 24; round = ++_j) {
        for (x = _k = 0; _k < 5; x = ++_k) {
          tMsw = tLsw = 0;
          for (y = _l = 0; _l < 5; y = ++_l) {
            lane = state[x + 5 * y];
            tMsw ^= lane.high;
            tLsw ^= lane.low;
          }
          Tx = G.T[x];
          Tx.high = tMsw;
          Tx.low = tLsw;
        }
        for (x = _m = 0; _m < 5; x = ++_m) {
          Tx4 = G.T[(x + 4) % 5];
          Tx1 = G.T[(x + 1) % 5];
          Tx1Msw = Tx1.high;
          Tx1Lsw = Tx1.low;
          tMsw = Tx4.high ^ ((Tx1Msw << 1) | (Tx1Lsw >>> 31));
          tLsw = Tx4.low ^ ((Tx1Lsw << 1) | (Tx1Msw >>> 31));
          for (y = _n = 0; _n < 5; y = ++_n) {
            lane = state[x + 5 * y];
            lane.high ^= tMsw;
            lane.low ^= tLsw;
          }
        }
        for (laneIndex = _o = 1; _o < 25; laneIndex = ++_o) {
          lane = state[laneIndex];
          laneMsw = lane.high;
          laneLsw = lane.low;
          rhoOffset = G.RHO_OFFSETS[laneIndex];
          if (rhoOffset < 32) {
            tMsw = (laneMsw << rhoOffset) | (laneLsw >>> (32 - rhoOffset));
            tLsw = (laneLsw << rhoOffset) | (laneMsw >>> (32 - rhoOffset));
          } else {
            tMsw = (laneLsw << (rhoOffset - 32)) | (laneMsw >>> (64 - rhoOffset));
            tLsw = (laneMsw << (rhoOffset - 32)) | (laneLsw >>> (64 - rhoOffset));
          }
          TPiLane = G.T[G.PI_INDEXES[laneIndex]];
          TPiLane.high = tMsw;
          TPiLane.low = tLsw;
        }
        T0 = G.T[0];
        state0 = state[0];
        T0.high = state0.high;
        T0.low = state0.low;
        for (x = _p = 0; _p < 5; x = ++_p) {
          for (y = _q = 0; _q < 5; y = ++_q) {
            laneIndex = x + 5 * y;
            lane = state[laneIndex];
            TLane = G.T[laneIndex];
            Tx1Lane = G.T[((x + 1) % 5) + 5 * y];
            Tx2Lane = G.T[((x + 2) % 5) + 5 * y];
            lane.high = TLane.high ^ (~Tx1Lane.high & Tx2Lane.high);
            lane.low = TLane.low ^ (~Tx1Lane.low & Tx2Lane.low);
          }
        }
        lane = state[0];
        roundConstant = G.ROUND_CONSTANTS[round];
        lane.high ^= roundConstant.high;
        _results.push(lane.low ^= roundConstant.low);
      }
      return _results;
    };

    SHA3.prototype._doFinalize = function() {
      var blockSizeBits, data, dataWords, hashWords, i, lane, laneLsw, laneMsw, nBitsLeft, nBitsTotal, outputLengthBytes, outputLengthLanes, state, _i;
      data = this._data;
      dataWords = data.words;
      nBitsTotal = this._nDataBytes * 8;
      nBitsLeft = data.sigBytes * 8;
      blockSizeBits = this.blockSize * 32;
      dataWords[nBitsLeft >>> 5] |= 0x1 << (24 - nBitsLeft % 32);
      dataWords[((Math.ceil((nBitsLeft + 1) / blockSizeBits) * blockSizeBits) >>> 5) - 1] |= 0x80;
      data.sigBytes = dataWords.length * 4;
      this._process();
      state = this._state;
      outputLengthBytes = this.outputLength / 8;
      outputLengthLanes = outputLengthBytes / 8;
      hashWords = [];
      for (i = _i = 0; 0 <= outputLengthLanes ? _i < outputLengthLanes : _i > outputLengthLanes; i = 0 <= outputLengthLanes ? ++_i : --_i) {
        lane = state[i];
        laneMsw = lane.high;
        laneLsw = lane.low;
        laneMsw = (((laneMsw << 8) | (laneMsw >>> 24)) & 0x00ff00ff) | (((laneMsw << 24) | (laneMsw >>> 8)) & 0xff00ff00);
        laneLsw = (((laneLsw << 8) | (laneLsw >>> 24)) & 0x00ff00ff) | (((laneLsw << 24) | (laneLsw >>> 8)) & 0xff00ff00);
        hashWords.push(laneLsw);
        hashWords.push(laneMsw);
      }
      return new WordArray(hashWords, outputLengthBytes);
    };

    SHA3.prototype.copy_to = function(obj) {
      var s;
      SHA3.__super__.copy_to.call(this, obj);
      return obj._state = (function() {
        var _i, _len, _ref2, _results;
        _ref2 = this._state;
        _results = [];
        for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
          s = _ref2[_i];
          _results.push(s.clone());
        }
        return _results;
      }).call(this);
    };

    SHA3.prototype.scrub = function() {};

    SHA3.prototype.clone = function() {
      var out;
      out = new SHA3();
      this.copy_to(out);
      return out;
    };

    return SHA3;

  })(Hasher);

  exports.transform = function(x) {
    var out;
    out = (new SHA3).finalize(x);
    x.scrub();
    return out;
  };

}).call(this);

},{"./algbase":18,"./wordarray":38}],35:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var Global, Hasher, SHA512, X64Word, X64WordArray, glbl, _ref, _ref1,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };



  _ref = require('./wordarray'), X64Word = _ref.X64Word, X64WordArray = _ref.X64WordArray;

  Hasher = require('./algbase').Hasher;

  Global = (function() {
    Global.prototype.convert = function(raw) {
      var i, _i, _ref1, _results;
      _results = [];
      for (i = _i = 0, _ref1 = raw.length; _i < _ref1; i = _i += 2) {
        _results.push(new X64Word(raw[i], raw[i + 1]));
      }
      return _results;
    };

    function Global() {
      var i;
      this.K = this.convert([0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc, 0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019, 0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118, 0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe, 0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2, 0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1, 0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694, 0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3, 0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65, 0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5, 0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4, 0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725, 0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70, 0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df, 0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b, 0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001, 0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30, 0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8, 0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53, 0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8, 0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb, 0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3, 0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60, 0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec, 0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b, 0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207, 0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178, 0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6, 0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b, 0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c, 0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a, 0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817]);
      this.I = new X64WordArray(this.convert([0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b, 0xa54ff53a, 0x5f1d36f1, 0x510e527f, 0xade682d1, 0x9b05688c, 0x2b3e6c1f, 0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179]));
      this.W = (function() {
        var _i, _results;
        _results = [];
        for (i = _i = 0; _i < 80; i = ++_i) {
          _results.push(new X64Word(0, 0));
        }
        return _results;
      })();
    }

    return Global;

  })();

  glbl = new Global();

  exports.SHA512 = SHA512 = (function(_super) {
    __extends(SHA512, _super);

    function SHA512() {
      _ref1 = SHA512.__super__.constructor.apply(this, arguments);
      return _ref1;
    }

    SHA512.blockSize = 1024 / 32;

    SHA512.prototype.blockSize = SHA512.blockSize;

    SHA512.output_size = 512 / 8;

    SHA512.prototype.output_size = SHA512.output_size;

    SHA512.prototype._doReset = function() {
      return this._hash = glbl.I.clone();
    };

    SHA512.prototype._doProcessBlock = function(M, offset) {
      var H, H0, H0h, H0l, H1, H1h, H1l, H2, H2h, H2l, H3, H3h, H3l, H4, H4h, H4l, H5, H5h, H5l, H6, H6h, H6l, H7, H7h, H7l, Ki, Kih, Kil, W, Wi, Wi16, Wi16h, Wi16l, Wi7, Wi7h, Wi7l, Wih, Wil, ah, al, bh, bl, ch, chh, chl, cl, dh, dl, eh, el, fh, fl, gamma0h, gamma0l, gamma0x, gamma0xh, gamma0xl, gamma1h, gamma1l, gamma1x, gamma1xh, gamma1xl, gh, gl, hh, hl, i, majh, majl, sigma0h, sigma0l, sigma1h, sigma1l, t1h, t1l, t2h, t2l, _i;
      H = this._hash.words;
      W = glbl.W;
      H0 = H[0];
      H1 = H[1];
      H2 = H[2];
      H3 = H[3];
      H4 = H[4];
      H5 = H[5];
      H6 = H[6];
      H7 = H[7];
      H0h = H0.high;
      H0l = H0.low;
      H1h = H1.high;
      H1l = H1.low;
      H2h = H2.high;
      H2l = H2.low;
      H3h = H3.high;
      H3l = H3.low;
      H4h = H4.high;
      H4l = H4.low;
      H5h = H5.high;
      H5l = H5.low;
      H6h = H6.high;
      H6l = H6.low;
      H7h = H7.high;
      H7l = H7.low;
      ah = H0h;
      al = H0l;
      bh = H1h;
      bl = H1l;
      ch = H2h;
      cl = H2l;
      dh = H3h;
      dl = H3l;
      eh = H4h;
      el = H4l;
      fh = H5h;
      fl = H5l;
      gh = H6h;
      gl = H6l;
      hh = H7h;
      hl = H7l;
      for (i = _i = 0; _i < 80; i = ++_i) {
        Wi = W[i];
        if (i < 16) {
          Wih = Wi.high = M[offset + i * 2] | 0;
          Wil = Wi.low = M[offset + i * 2 + 1] | 0;
        } else {
          gamma0x = W[i - 15];
          gamma0xh = gamma0x.high;
          gamma0xl = gamma0x.low;
          gamma0h = ((gamma0xh >>> 1) | (gamma0xl << 31)) ^ ((gamma0xh >>> 8) | (gamma0xl << 24)) ^ (gamma0xh >>> 7);
          gamma0l = ((gamma0xl >>> 1) | (gamma0xh << 31)) ^ ((gamma0xl >>> 8) | (gamma0xh << 24)) ^ ((gamma0xl >>> 7) | (gamma0xh << 25));
          gamma1x = W[i - 2];
          gamma1xh = gamma1x.high;
          gamma1xl = gamma1x.low;
          gamma1h = ((gamma1xh >>> 19) | (gamma1xl << 13)) ^ ((gamma1xh << 3) | (gamma1xl >>> 29)) ^ (gamma1xh >>> 6);
          gamma1l = ((gamma1xl >>> 19) | (gamma1xh << 13)) ^ ((gamma1xl << 3) | (gamma1xh >>> 29)) ^ ((gamma1xl >>> 6) | (gamma1xh << 26));
          Wi7 = W[i - 7];
          Wi7h = Wi7.high;
          Wi7l = Wi7.low;
          Wi16 = W[i - 16];
          Wi16h = Wi16.high;
          Wi16l = Wi16.low;
          Wil = gamma0l + Wi7l;
          Wih = gamma0h + Wi7h + ((Wil >>> 0) < (gamma0l >>> 0) ? 1 : 0);
          Wil = Wil + gamma1l;
          Wih = Wih + gamma1h + ((Wil >>> 0) < (gamma1l >>> 0) ? 1 : 0);
          Wil = Wil + Wi16l;
          Wih = Wih + Wi16h + ((Wil >>> 0) < (Wi16l >>> 0) ? 1 : 0);
          Wi.high = Wih;
          Wi.low = Wil;
        }
        chh = (eh & fh) ^ (~eh & gh);
        chl = (el & fl) ^ (~el & gl);
        majh = (ah & bh) ^ (ah & ch) ^ (bh & ch);
        majl = (al & bl) ^ (al & cl) ^ (bl & cl);
        sigma0h = ((ah >>> 28) | (al << 4)) ^ ((ah << 30) | (al >>> 2)) ^ ((ah << 25) | (al >>> 7));
        sigma0l = ((al >>> 28) | (ah << 4)) ^ ((al << 30) | (ah >>> 2)) ^ ((al << 25) | (ah >>> 7));
        sigma1h = ((eh >>> 14) | (el << 18)) ^ ((eh >>> 18) | (el << 14)) ^ ((eh << 23) | (el >>> 9));
        sigma1l = ((el >>> 14) | (eh << 18)) ^ ((el >>> 18) | (eh << 14)) ^ ((el << 23) | (eh >>> 9));
        Ki = glbl.K[i];
        Kih = Ki.high;
        Kil = Ki.low;
        t1l = hl + sigma1l;
        t1h = hh + sigma1h + ((t1l >>> 0) < (hl >>> 0) ? 1 : 0);
        t1l = t1l + chl;
        t1h = t1h + chh + ((t1l >>> 0) < (chl >>> 0) ? 1 : 0);
        t1l = t1l + Kil;
        t1h = t1h + Kih + ((t1l >>> 0) < (Kil >>> 0) ? 1 : 0);
        t1l = t1l + Wil;
        t1h = t1h + Wih + ((t1l >>> 0) < (Wil >>> 0) ? 1 : 0);
        t2l = sigma0l + majl;
        t2h = sigma0h + majh + ((t2l >>> 0) < (sigma0l >>> 0) ? 1 : 0);
        hh = gh;
        hl = gl;
        gh = fh;
        gl = fl;
        fh = eh;
        fl = el;
        el = (dl + t1l) | 0;
        eh = (dh + t1h + ((el >>> 0) < (dl >>> 0) ? 1 : 0)) | 0;
        dh = ch;
        dl = cl;
        ch = bh;
        cl = bl;
        bh = ah;
        bl = al;
        al = (t1l + t2l) | 0;
        ah = (t1h + t2h + ((al >>> 0) < (t1l >>> 0) ? 1 : 0)) | 0;
      }
      H0l = H0.low = H0l + al;
      H0.high = H0h + ah + ((H0l >>> 0) < (al >>> 0) ? 1 : 0);
      H1l = H1.low = H1l + bl;
      H1.high = H1h + bh + ((H1l >>> 0) < (bl >>> 0) ? 1 : 0);
      H2l = H2.low = H2l + cl;
      H2.high = H2h + ch + ((H2l >>> 0) < (cl >>> 0) ? 1 : 0);
      H3l = H3.low = H3l + dl;
      H3.high = H3h + dh + ((H3l >>> 0) < (dl >>> 0) ? 1 : 0);
      H4l = H4.low = H4l + el;
      H4.high = H4h + eh + ((H4l >>> 0) < (el >>> 0) ? 1 : 0);
      H5l = H5.low = H5l + fl;
      H5.high = H5h + fh + ((H5l >>> 0) < (fl >>> 0) ? 1 : 0);
      H6l = H6.low = H6l + gl;
      H6.high = H6h + gh + ((H6l >>> 0) < (gl >>> 0) ? 1 : 0);
      H7l = H7.low = H7l + hl;
      return H7.high = H7h + hh + ((H7l >>> 0) < (hl >>> 0) ? 1 : 0);
    };

    SHA512.prototype._doFinalize = function() {
      var dataWords, nBitsLeft, nBitsTotal;
      dataWords = this._data.words;
      nBitsTotal = this._nDataBytes * 8;
      nBitsLeft = this._data.sigBytes * 8;
      dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - nBitsLeft % 32);
      dataWords[(((nBitsLeft + 128) >>> 10) << 5) + 30] = Math.floor(nBitsTotal / 0x100000000);
      dataWords[(((nBitsLeft + 128) >>> 10) << 5) + 31] = nBitsTotal;
      this._data.sigBytes = dataWords.length * 4;
      this._process();
      return this._hash.toX32();
    };

    SHA512.prototype.copy_to = function(obj) {
      SHA512.__super__.copy_to.call(this, obj);
      return obj._hash = this._hash.clone();
    };

    SHA512.prototype.clone = function() {
      var out;
      out = new SHA512();
      this.copy_to(out);
      return out;
    };

    return SHA512;

  })(Hasher);

  exports.transform = function(x) {
    var out;
    out = (new SHA512).finalize(x);
    x.scrub();
    return out;
  };

}).call(this);

},{"./algbase":18,"./wordarray":38}],36:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var BlockCipher, G, Global, TwoFish, scrub_vec,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };



  BlockCipher = require('./algbase').BlockCipher;

  scrub_vec = require('./util').scrub_vec;

  Global = (function() {
    function Global() {
      this.P = [[0xA9, 0x67, 0xB3, 0xE8, 0x04, 0xFD, 0xA3, 0x76, 0x9A, 0x92, 0x80, 0x78, 0xE4, 0xDD, 0xD1, 0x38, 0x0D, 0xC6, 0x35, 0x98, 0x18, 0xF7, 0xEC, 0x6C, 0x43, 0x75, 0x37, 0x26, 0xFA, 0x13, 0x94, 0x48, 0xF2, 0xD0, 0x8B, 0x30, 0x84, 0x54, 0xDF, 0x23, 0x19, 0x5B, 0x3D, 0x59, 0xF3, 0xAE, 0xA2, 0x82, 0x63, 0x01, 0x83, 0x2E, 0xD9, 0x51, 0x9B, 0x7C, 0xA6, 0xEB, 0xA5, 0xBE, 0x16, 0x0C, 0xE3, 0x61, 0xC0, 0x8C, 0x3A, 0xF5, 0x73, 0x2C, 0x25, 0x0B, 0xBB, 0x4E, 0x89, 0x6B, 0x53, 0x6A, 0xB4, 0xF1, 0xE1, 0xE6, 0xBD, 0x45, 0xE2, 0xF4, 0xB6, 0x66, 0xCC, 0x95, 0x03, 0x56, 0xD4, 0x1C, 0x1E, 0xD7, 0xFB, 0xC3, 0x8E, 0xB5, 0xE9, 0xCF, 0xBF, 0xBA, 0xEA, 0x77, 0x39, 0xAF, 0x33, 0xC9, 0x62, 0x71, 0x81, 0x79, 0x09, 0xAD, 0x24, 0xCD, 0xF9, 0xD8, 0xE5, 0xC5, 0xB9, 0x4D, 0x44, 0x08, 0x86, 0xE7, 0xA1, 0x1D, 0xAA, 0xED, 0x06, 0x70, 0xB2, 0xD2, 0x41, 0x7B, 0xA0, 0x11, 0x31, 0xC2, 0x27, 0x90, 0x20, 0xF6, 0x60, 0xFF, 0x96, 0x5C, 0xB1, 0xAB, 0x9E, 0x9C, 0x52, 0x1B, 0x5F, 0x93, 0x0A, 0xEF, 0x91, 0x85, 0x49, 0xEE, 0x2D, 0x4F, 0x8F, 0x3B, 0x47, 0x87, 0x6D, 0x46, 0xD6, 0x3E, 0x69, 0x64, 0x2A, 0xCE, 0xCB, 0x2F, 0xFC, 0x97, 0x05, 0x7A, 0xAC, 0x7F, 0xD5, 0x1A, 0x4B, 0x0E, 0xA7, 0x5A, 0x28, 0x14, 0x3F, 0x29, 0x88, 0x3C, 0x4C, 0x02, 0xB8, 0xDA, 0xB0, 0x17, 0x55, 0x1F, 0x8A, 0x7D, 0x57, 0xC7, 0x8D, 0x74, 0xB7, 0xC4, 0x9F, 0x72, 0x7E, 0x15, 0x22, 0x12, 0x58, 0x07, 0x99, 0x34, 0x6E, 0x50, 0xDE, 0x68, 0x65, 0xBC, 0xDB, 0xF8, 0xC8, 0xA8, 0x2B, 0x40, 0xDC, 0xFE, 0x32, 0xA4, 0xCA, 0x10, 0x21, 0xF0, 0xD3, 0x5D, 0x0F, 0x00, 0x6F, 0x9D, 0x36, 0x42, 0x4A, 0x5E, 0xC1, 0xE0], [0x75, 0xF3, 0xC6, 0xF4, 0xDB, 0x7B, 0xFB, 0xC8, 0x4A, 0xD3, 0xE6, 0x6B, 0x45, 0x7D, 0xE8, 0x4B, 0xD6, 0x32, 0xD8, 0xFD, 0x37, 0x71, 0xF1, 0xE1, 0x30, 0x0F, 0xF8, 0x1B, 0x87, 0xFA, 0x06, 0x3F, 0x5E, 0xBA, 0xAE, 0x5B, 0x8A, 0x00, 0xBC, 0x9D, 0x6D, 0xC1, 0xB1, 0x0E, 0x80, 0x5D, 0xD2, 0xD5, 0xA0, 0x84, 0x07, 0x14, 0xB5, 0x90, 0x2C, 0xA3, 0xB2, 0x73, 0x4C, 0x54, 0x92, 0x74, 0x36, 0x51, 0x38, 0xB0, 0xBD, 0x5A, 0xFC, 0x60, 0x62, 0x96, 0x6C, 0x42, 0xF7, 0x10, 0x7C, 0x28, 0x27, 0x8C, 0x13, 0x95, 0x9C, 0xC7, 0x24, 0x46, 0x3B, 0x70, 0xCA, 0xE3, 0x85, 0xCB, 0x11, 0xD0, 0x93, 0xB8, 0xA6, 0x83, 0x20, 0xFF, 0x9F, 0x77, 0xC3, 0xCC, 0x03, 0x6F, 0x08, 0xBF, 0x40, 0xE7, 0x2B, 0xE2, 0x79, 0x0C, 0xAA, 0x82, 0x41, 0x3A, 0xEA, 0xB9, 0xE4, 0x9A, 0xA4, 0x97, 0x7E, 0xDA, 0x7A, 0x17, 0x66, 0x94, 0xA1, 0x1D, 0x3D, 0xF0, 0xDE, 0xB3, 0x0B, 0x72, 0xA7, 0x1C, 0xEF, 0xD1, 0x53, 0x3E, 0x8F, 0x33, 0x26, 0x5F, 0xEC, 0x76, 0x2A, 0x49, 0x81, 0x88, 0xEE, 0x21, 0xC4, 0x1A, 0xEB, 0xD9, 0xC5, 0x39, 0x99, 0xCD, 0xAD, 0x31, 0x8B, 0x01, 0x18, 0x23, 0xDD, 0x1F, 0x4E, 0x2D, 0xF9, 0x48, 0x4F, 0xF2, 0x65, 0x8E, 0x78, 0x5C, 0x58, 0x19, 0x8D, 0xE5, 0x98, 0x57, 0x67, 0x7F, 0x05, 0x64, 0xAF, 0x63, 0xB6, 0xFE, 0xF5, 0xB7, 0x3C, 0xA5, 0xCE, 0xE9, 0x68, 0x44, 0xE0, 0x4D, 0x43, 0x69, 0x29, 0x2E, 0xAC, 0x15, 0x59, 0xA8, 0x0A, 0x9E, 0x6E, 0x47, 0xDF, 0x34, 0x35, 0x6A, 0xCF, 0xDC, 0x22, 0xC9, 0xC0, 0x9B, 0x89, 0xD4, 0xED, 0xAB, 0x12, 0xA2, 0x0D, 0x52, 0xBB, 0x02, 0x2F, 0xA9, 0xD7, 0x61, 0x1E, 0xB4, 0x50, 0x04, 0xF6, 0xC2, 0x16, 0x25, 0x86, 0x56, 0x55, 0x09, 0xBE, 0x91]];
      this.P_00 = 1;
      this.P_01 = 0;
      this.P_02 = 0;
      this.P_03 = 1;
      this.P_04 = 1;
      this.P_10 = 0;
      this.P_11 = 0;
      this.P_12 = 1;
      this.P_13 = 1;
      this.P_14 = 0;
      this.P_20 = 1;
      this.P_21 = 1;
      this.P_22 = 0;
      this.P_23 = 0;
      this.P_24 = 0;
      this.P_30 = 0;
      this.P_31 = 1;
      this.P_32 = 1;
      this.P_33 = 0;
      this.P_34 = 1;
      this.GF256_FDBK = 0x169;
      this.GF256_FDBK_2 = this.GF256_FDBK / 2;
      this.GF256_FDBK_4 = this.GF256_FDBK / 4;
      this.RS_GF_FDBK = 0x14D;
      this.SK_STEP = 0x02020202;
      this.SK_BUMP = 0x01010101;
      this.SK_ROTL = 9;
    }

    return Global;

  })();

  G = new Global();

  exports.TwoFish = TwoFish = (function(_super) {
    __extends(TwoFish, _super);

    TwoFish.blockSize = 4 * 4;

    TwoFish.prototype.blockSize = TwoFish.blockSize;

    TwoFish.keySize = 256 / 8;

    TwoFish.prototype.keySize = TwoFish.keySize;

    TwoFish.ivSize = TwoFish.blockSize;

    TwoFish.prototype.ivSize = TwoFish.ivSize;

    function TwoFish(key) {
      this._key = key.clone();
      this.gMDS0 = [];
      this.gMDS1 = [];
      this.gMDS2 = [];
      this.gMDS3 = [];
      this.gSubKeys = [];
      this.gSBox = [];
      this.k64Cnt = 0;
      this._doReset();
    }

    TwoFish.prototype.getByte = function(x, n) {
      return (x >>> (n * 8)) & 0xFF;
    };

    TwoFish.prototype.switchEndianness = function(word) {
      return ((word & 0xff) << 24) | (((word >> 8) & 0xff) << 16) | (((word >> 16) & 0xff) << 8) | ((word >> 24) & 0xff);
    };

    TwoFish.prototype.LFSR1 = function(x) {
      return (x >> 1) ^ ((x & 0x01) !== 0 ? G.GF256_FDBK_2 : 0);
    };

    TwoFish.prototype.LFSR2 = function(x) {
      return (x >> 2) ^ ((x & 0x02) !== 0 ? G.GF256_FDBK_2 : 0) ^ ((x & 0x01) !== 0 ? G.GF256_FDBK_4 : 0);
    };

    TwoFish.prototype.Mx_X = function(x) {
      return x ^ this.LFSR2(x);
    };

    TwoFish.prototype.Mx_Y = function(x) {
      return x ^ this.LFSR1(x) ^ this.LFSR2(x);
    };

    TwoFish.prototype.RS_rem = function(x) {
      var b, g2, g3;
      b = (x >>> 24) & 0xff;
      g2 = ((b << 1) ^ ((b & 0x80) !== 0 ? G.RS_GF_FDBK : 0)) & 0xff;
      g3 = ((b >>> 1) ^ ((b & 0x01) !== 0 ? G.RS_GF_FDBK >>> 1 : 0)) ^ g2;
      return (x << 8) ^ (g3 << 24) ^ (g2 << 16) ^ (g3 << 8) ^ b;
    };

    TwoFish.prototype.RS_MDS_Encode = function(k0, k1) {
      var i, r, _i, _j;
      r = k1;
      for (i = _i = 0; _i < 4; i = ++_i) {
        r = this.RS_rem(r);
      }
      r ^= k0;
      for (i = _j = 0; _j < 4; i = ++_j) {
        r = this.RS_rem(r);
      }
      return r;
    };

    TwoFish.prototype.F32 = function(x, k32) {
      var b0, b1, b2, b3, k0, k1, k2, k3, m, res;
      b0 = this.getByte(x, 0);
      b1 = this.getByte(x, 1);
      b2 = this.getByte(x, 2);
      b3 = this.getByte(x, 3);
      k0 = k32[0];
      k1 = k32[1];
      k2 = k32[2];
      k3 = k32[3];
      m = this.k64Cnt & 3;
      res = m === 1 ? this.gMDS0[(G.P[G.P_01][b0] & 0xff) ^ this.getByte(k0, 0)] ^ this.gMDS1[(G.P[G.P_11][b1] & 0xff) ^ this.getByte(k0, 1)] ^ this.gMDS2[(G.P[G.P_21][b2] & 0xff) ^ this.getByte(k0, 2)] ^ this.gMDS3[(G.P[G.P_31][b3] & 0xff) ^ this.getByte(k0, 3)] : (m === 0 ? (b0 = (G.P[G.P_04][b0] & 0xff) ^ this.getByte(k3, 0), b1 = (G.P[G.P_14][b1] & 0xff) ^ this.getByte(k3, 1), b2 = (G.P[G.P_24][b2] & 0xff) ^ this.getByte(k3, 2), b3 = (G.P[G.P_34][b3] & 0xff) ^ this.getByte(k3, 3)) : void 0, m === 0 || m === 3 ? (b0 = (G.P[G.P_03][b0] & 0xff) ^ this.getByte(k2, 0), b1 = (G.P[G.P_13][b1] & 0xff) ^ this.getByte(k2, 1), b2 = (G.P[G.P_23][b2] & 0xff) ^ this.getByte(k2, 2), b3 = (G.P[G.P_33][b3] & 0xff) ^ this.getByte(k2, 3)) : void 0, this.gMDS0[(G.P[G.P_01][(G.P[G.P_02][b0] & 0xff) ^ this.getByte(k1, 0)] & 0xff) ^ this.getByte(k0, 0)] ^ this.gMDS1[(G.P[G.P_11][(G.P[G.P_12][b1] & 0xff) ^ this.getByte(k1, 1)] & 0xff) ^ this.getByte(k0, 1)] ^ this.gMDS2[(G.P[G.P_21][(G.P[G.P_22][b2] & 0xff) ^ this.getByte(k1, 2)] & 0xff) ^ this.getByte(k0, 2)] ^ this.gMDS3[(G.P[G.P_31][(G.P[G.P_32][b3] & 0xff) ^ this.getByte(k1, 3)] & 0xff) ^ this.getByte(k0, 3)]);
      return res;
    };

    TwoFish.prototype.Fe32_0 = function(x) {
      return this.gSBox[0x000 + 2 * (x & 0xff)] ^ this.gSBox[0x001 + 2 * ((x >>> 8) & 0xff)] ^ this.gSBox[0x200 + 2 * ((x >>> 16) & 0xff)] ^ this.gSBox[0x201 + 2 * ((x >>> 24) & 0xff)];
    };

    TwoFish.prototype.Fe32_3 = function(x) {
      return this.gSBox[0x000 + 2 * ((x >>> 24) & 0xff)] ^ this.gSBox[0x001 + 2 * (x & 0xff)] ^ this.gSBox[0x200 + 2 * ((x >>> 8) & 0xff)] ^ this.gSBox[0x201 + 2 * ((x >>> 16) & 0xff)];
    };

    TwoFish.prototype._doReset = function() {
      var A, B, b0, b1, b2, b3, i, j, k0, k1, k2, k3, k32e, k32o, m, m1, mX, mY, p, q, sBoxKeys, _i, _j, _k, _l, _ref, _ref1, _results;
      k32e = [];
      k32o = [];
      sBoxKeys = [];
      m1 = [];
      mX = [];
      mY = [];
      this.k64Cnt = this._key.words.length / 2;
      if (this.k64Cnt < 1) {
        throw "Key size less than 64 bits";
      }
      if (this.k64Cnt > 4) {
        throw "Key size larger than 256 bits";
      }
      for (i = _i = 0; _i < 256; i = ++_i) {
        j = G.P[0][i] & 0xff;
        m1[0] = j;
        mX[0] = this.Mx_X(j) & 0xff;
        mY[0] = this.Mx_Y(j) & 0xff;
        j = G.P[1][i] & 0xff;
        m1[1] = j;
        mX[1] = this.Mx_X(j) & 0xff;
        mY[1] = this.Mx_Y(j) & 0xff;
        this.gMDS0[i] = m1[G.P_00] | mX[G.P_00] << 8 | mY[G.P_00] << 16 | mY[G.P_00] << 24;
        this.gMDS1[i] = mY[G.P_10] | mY[G.P_10] << 8 | mX[G.P_10] << 16 | m1[G.P_10] << 24;
        this.gMDS2[i] = mX[G.P_20] | mY[G.P_20] << 8 | m1[G.P_20] << 16 | mY[G.P_20] << 24;
        this.gMDS3[i] = mX[G.P_30] | m1[G.P_30] << 8 | mY[G.P_30] << 16 | mX[G.P_30] << 24;
      }
      for (i = _j = 0, _ref = this.k64Cnt; 0 <= _ref ? _j < _ref : _j > _ref; i = 0 <= _ref ? ++_j : --_j) {
        p = i * 2;
        k32e[i] = this.switchEndianness(this._key.words[p]);
        k32o[i] = this.switchEndianness(this._key.words[p + 1]);
        sBoxKeys[this.k64Cnt - 1 - i] = this.RS_MDS_Encode(k32e[i], k32o[i]);
      }
      for (i = _k = 0, _ref1 = 40 / 2; 0 <= _ref1 ? _k < _ref1 : _k > _ref1; i = 0 <= _ref1 ? ++_k : --_k) {
        q = i * G.SK_STEP;
        A = this.F32(q, k32e);
        B = this.F32(q + G.SK_BUMP, k32o);
        B = B << 8 | B >>> 24;
        A += B;
        this.gSubKeys[i * 2] = A;
        A += B;
        this.gSubKeys[i * 2 + 1] = A << G.SK_ROTL | A >>> (32 - G.SK_ROTL);
      }
      k0 = sBoxKeys[0];
      k1 = sBoxKeys[1];
      k2 = sBoxKeys[2];
      k3 = sBoxKeys[3];
      this.gSBox = [];
      _results = [];
      for (i = _l = 0; _l < 256; i = ++_l) {
        b0 = b1 = b2 = b3 = i;
        m = this.k64Cnt & 3;
        if (m === 1) {
          this.gSBox[i * 2] = this.gMDS0[(G.P[G.P_01][b0] & 0xff) ^ this.getByte(k0, 0)];
          this.gSBox[i * 2 + 1] = this.gMDS1[(G.P[G.P_11][b1] & 0xff) ^ this.getByte(k0, 1)];
          this.gSBox[i * 2 + 0x200] = this.gMDS2[(G.P[G.P_21][b2] & 0xff) ^ this.getByte(k0, 2)];
          _results.push(this.gSBox[i * 2 + 0x201] = this.gMDS3[(G.P[G.P_31][b3] & 0xff) ^ this.getByte(k0, 3)]);
        } else {
          if (m === 0) {
            b0 = (G.P[G.P_04][b0] & 0xff) ^ this.getByte(k3, 0);
            b1 = (G.P[G.P_14][b1] & 0xff) ^ this.getByte(k3, 1);
            b2 = (G.P[G.P_24][b2] & 0xff) ^ this.getByte(k3, 2);
            b3 = (G.P[G.P_34][b3] & 0xff) ^ this.getByte(k3, 3);
          }
          if (m === 0 || m === 3) {
            b0 = (G.P[G.P_03][b0] & 0xff) ^ this.getByte(k2, 0);
            b1 = (G.P[G.P_13][b1] & 0xff) ^ this.getByte(k2, 1);
            b2 = (G.P[G.P_23][b2] & 0xff) ^ this.getByte(k2, 2);
            b3 = (G.P[G.P_33][b3] & 0xff) ^ this.getByte(k2, 3);
          }
          this.gSBox[i * 2] = this.gMDS0[(G.P[G.P_01][(G.P[G.P_02][b0] & 0xff) ^ this.getByte(k1, 0)] & 0xff) ^ this.getByte(k0, 0)];
          this.gSBox[i * 2 + 1] = this.gMDS1[(G.P[G.P_11][(G.P[G.P_12][b1] & 0xff) ^ this.getByte(k1, 1)] & 0xff) ^ this.getByte(k0, 1)];
          this.gSBox[i * 2 + 0x200] = this.gMDS2[(G.P[G.P_21][(G.P[G.P_22][b2] & 0xff) ^ this.getByte(k1, 2)] & 0xff) ^ this.getByte(k0, 2)];
          _results.push(this.gSBox[i * 2 + 0x201] = this.gMDS3[(G.P[G.P_31][(G.P[G.P_32][b3] & 0xff) ^ this.getByte(k1, 3)] & 0xff) ^ this.getByte(k0, 3)]);
        }
      }
      return _results;
    };

    TwoFish.prototype.scrub = function() {
      scrub_vec(this.gSubKeys);
      scrub_vec(this.gSBox);
      return this._key.scrub();
    };

    TwoFish.prototype.decryptBlock = function(M, offset) {
      var k, r, t0, t1, x0, x1, x2, x3, _i;
      if (offset == null) {
        offset = 0;
      }
      x2 = this.switchEndianness(M[offset]) ^ this.gSubKeys[4];
      x3 = this.switchEndianness(M[offset + 1]) ^ this.gSubKeys[5];
      x0 = this.switchEndianness(M[offset + 2]) ^ this.gSubKeys[6];
      x1 = this.switchEndianness(M[offset + 3]) ^ this.gSubKeys[7];
      k = 8 + 2 * 16 - 1;
      for (r = _i = 0; _i < 16; r = _i += 2) {
        t0 = this.Fe32_0(x2);
        t1 = this.Fe32_3(x3);
        x1 ^= t0 + 2 * t1 + this.gSubKeys[k--];
        x0 = (x0 << 1 | x0 >>> 31) ^ (t0 + t1 + this.gSubKeys[k--]);
        x1 = x1 >>> 1 | x1 << 31;
        t0 = this.Fe32_0(x0);
        t1 = this.Fe32_3(x1);
        x3 ^= t0 + 2 * t1 + this.gSubKeys[k--];
        x2 = (x2 << 1 | x2 >>> 31) ^ (t0 + t1 + this.gSubKeys[k--]);
        x3 = x3 >>> 1 | x3 << 31;
      }
      M[offset] = this.switchEndianness(x0 ^ this.gSubKeys[0]);
      M[offset + 1] = this.switchEndianness(x1 ^ this.gSubKeys[1]);
      M[offset + 2] = this.switchEndianness(x2 ^ this.gSubKeys[2]);
      return M[offset + 3] = this.switchEndianness(x3 ^ this.gSubKeys[3]);
    };

    TwoFish.prototype.encryptBlock = function(M, offset) {
      var k, r, t0, t1, x0, x1, x2, x3, _i;
      if (offset == null) {
        offset = 0;
      }
      x0 = this.switchEndianness(M[offset]) ^ this.gSubKeys[0];
      x1 = this.switchEndianness(M[offset + 1]) ^ this.gSubKeys[1];
      x2 = this.switchEndianness(M[offset + 2]) ^ this.gSubKeys[2];
      x3 = this.switchEndianness(M[offset + 3]) ^ this.gSubKeys[3];
      k = 8;
      for (r = _i = 0; _i < 16; r = _i += 2) {
        t0 = this.Fe32_0(x0);
        t1 = this.Fe32_3(x1);
        x2 ^= t0 + t1 + this.gSubKeys[k++];
        x2 = x2 >>> 1 | x2 << 31;
        x3 = (x3 << 1 | x3 >>> 31) ^ (t0 + 2 * t1 + this.gSubKeys[k++]);
        t0 = this.Fe32_0(x2);
        t1 = this.Fe32_3(x3);
        x0 ^= t0 + t1 + this.gSubKeys[k++];
        x0 = x0 >>> 1 | x0 << 31;
        x1 = (x1 << 1 | x1 >>> 31) ^ (t0 + 2 * t1 + this.gSubKeys[k++]);
      }
      M[offset] = this.switchEndianness(x2 ^ this.gSubKeys[4]);
      M[offset + 1] = this.switchEndianness(x3 ^ this.gSubKeys[5]);
      M[offset + 2] = this.switchEndianness(x0 ^ this.gSubKeys[6]);
      return M[offset + 3] = this.switchEndianness(x1 ^ this.gSubKeys[7]);
    };

    return TwoFish;

  })(BlockCipher);

}).call(this);

},{"./algbase":18,"./util":37}],37:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var default_delay, iced, uint_max, __iced_k, __iced_k_noop;

  iced = require('iced-coffee-script/lib/coffee-script/iced').runtime;
  __iced_k = __iced_k_noop = function() {};

  uint_max = Math.pow(2, 32);

  exports.fixup_uint32 = function(x) {
    var ret, x_pos;
    ret = x > uint_max || x < 0 ? (x_pos = Math.abs(x) % uint_max, x < 0 ? uint_max - x_pos : x_pos) : x;
    return ret;
  };

  exports.scrub_buffer = function(b) {
    var i, n_full_words;
    n_full_words = b.length >> 2;
    i = 0;
    while (i < n_full_words) {
      b.writeUInt32LE(0, i);
      i += 4;
    }
    while (i < b.length) {
      b.writeUInt8(0, i);
      i++;
    }
    return false;
  };

  exports.scrub_vec = function(v) {
    var i, _i, _ref;
    for (i = _i = 0, _ref = v.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
      v[i] = 0;
    }
    return false;
  };

  exports.default_delay = default_delay = function(i, n, cb) {
    var ___iced_passed_deferral, __iced_deferrals, __iced_k,
      _this = this;
    __iced_k = __iced_k_noop;
    ___iced_passed_deferral = iced.findDeferral(arguments);
    (function(__iced_k) {
      if (typeof setImmediate !== "undefined" && setImmediate !== null) {
        (function(__iced_k) {
          __iced_deferrals = new iced.Deferrals(__iced_k, {
            parent: ___iced_passed_deferral,
            filename: "src/util.iced",
            funcname: "default_delay"
          });
          setImmediate(__iced_deferrals.defer({
            lineno: 37
          }));
          __iced_deferrals._fulfill();
        })(__iced_k);
      } else {
        (function(__iced_k) {
          __iced_deferrals = new iced.Deferrals(__iced_k, {
            parent: ___iced_passed_deferral,
            filename: "src/util.iced",
            funcname: "default_delay"
          });
          setTimeout(__iced_deferrals.defer({
            lineno: 39
          }), 1);
          __iced_deferrals._fulfill();
        })(__iced_k);
      }
    })(function() {
      return cb();
    });
  };

  exports.bulk = function(n_input_bytes, _arg, _arg1) {
    var call_ph, cb, default_n, delay, finalize, i, left, n, n_words, progress_hook, ret, total_words, update, what, ___iced_passed_deferral, __iced_deferrals, __iced_k,
      _this = this;
    __iced_k = __iced_k_noop;
    ___iced_passed_deferral = iced.findDeferral(arguments);
    update = _arg.update, finalize = _arg.finalize, default_n = _arg.default_n;
    delay = _arg1.delay, n = _arg1.n, cb = _arg1.cb, what = _arg1.what, progress_hook = _arg1.progress_hook;
    i = 0;
    left = 0;
    total_words = Math.ceil(n_input_bytes / 4);
    delay || (delay = default_delay);
    n || (n = default_n);
    call_ph = function(i) {
      return typeof progress_hook === "function" ? progress_hook({
        what: what,
        i: i,
        total: total_words
      }) : void 0;
    };
    call_ph(0);
    (function(__iced_k) {
      var _results, _while;
      _results = [];
      _while = function(__iced_k) {
        var _break, _continue, _next;
        _break = function() {
          return __iced_k(_results);
        };
        _continue = function() {
          return iced.trampoline(function() {
            return _while(__iced_k);
          });
        };
        _next = function(__iced_next_arg) {
          _results.push(__iced_next_arg);
          return _continue();
        };
        if (!((left = total_words - i) > 0)) {
          return _break();
        } else {
          n_words = Math.min(n, left);
          update(i, i + n_words);
          call_ph(i);
          (function(__iced_k) {
            __iced_deferrals = new iced.Deferrals(__iced_k, {
              parent: ___iced_passed_deferral,
              filename: "src/util.iced",
              funcname: "bulk"
            });
            delay(i, total_words, __iced_deferrals.defer({
              lineno: 73
            }));
            __iced_deferrals._fulfill();
          })(function() {
            return _next(i += n_words);
          });
        }
      };
      _while(__iced_k);
    })(function() {
      call_ph(total_words);
      ret = finalize();
      return cb(ret);
    });
  };

}).call(this);

},{"iced-coffee-script/lib/coffee-script/iced":9}],38:[function(require,module,exports){
(function (Buffer){
// Generated by IcedCoffeeScript 1.6.3-g
(function() {
  var WordArray, X64Word, X64WordArray, buffer_to_ui8a, endian_reverse, ui8a_to_buffer, util;



  util = require('./util');

  buffer_to_ui8a = function(b) {
    var i, ret, _i, _ref;
    ret = new Uint8Array(b.length);
    for (i = _i = 0, _ref = b.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
      ret[i] = b.readUInt8(i);
    }
    return ret;
  };

  ui8a_to_buffer = function(v) {
    var i, ret, _i, _ref;
    ret = new Buffer(v.length);
    for (i = _i = 0, _ref = v.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
      ret.writeUInt8(v[i], i);
    }
    return ret;
  };

  endian_reverse = function(x) {
    return ((x >>> 24) & 0xff) | (((x >>> 16) & 0xff) << 8) | (((x >>> 8) & 0xff) << 16) | ((x & 0xff) << 24);
  };

  exports.WordArray = WordArray = (function() {
    function WordArray(words, sigBytes) {
      this.words = words || [];
      this.sigBytes = sigBytes != null ? sigBytes : this.words.length * 4;
    }

    WordArray.prototype.concat = function(wordArray) {
      var i, thatByte, thatSigBytes, thatWords, _i;
      thatWords = wordArray.words;
      thatSigBytes = wordArray.sigBytes;
      this.clamp();
      if (this.sigBytes % 4) {
        for (i = _i = 0; 0 <= thatSigBytes ? _i < thatSigBytes : _i > thatSigBytes; i = 0 <= thatSigBytes ? ++_i : --_i) {
          thatByte = (thatWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
          this.words[(this.sigBytes + i) >>> 2] |= thatByte << (24 - ((this.sigBytes + i) % 4) * 8);
        }
      } else {
        this.words = this.words.concat(thatWords);
      }
      this.sigBytes += thatSigBytes;
      return this;
    };

    WordArray.prototype.clamp = function() {
      this.words[this.sigBytes >>> 2] &= 0xffffffff << (32 - (this.sigBytes % 4) * 8);
      this.words.length = Math.ceil(this.sigBytes / 4);
      return this;
    };

    WordArray.prototype.clone = function() {
      return new WordArray(this.words.slice(0), this.sigBytes);
    };

    WordArray.prototype.to_buffer = function() {
      var ch, out, p, w, _i, _len, _ref;
      out = new Buffer(this.sigBytes);
      p = 0;
      _ref = this.words;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        w = _ref[_i];
        if (!((this.sigBytes - p) >= 4)) {
          continue;
        }
        w = util.fixup_uint32(w);
        out.writeUInt32BE(w, p);
        p += 4;
      }
      while (p < this.sigBytes) {
        ch = (this.words[p >>> 2] >>> (24 - (p % 4) * 8)) & 0xff;
        out.writeUInt8(ch, p);
        p++;
      }
      return out;
    };

    WordArray.prototype.endian_reverse = function() {
      var i, w, _i, _len, _ref;
      _ref = this.words;
      for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
        w = _ref[i];
        this.words[i] = endian_reverse(w);
      }
      return this;
    };

    WordArray.prototype.split = function(n) {
      var i, out, sz;
      if (!(((this.sigBytes % 4) === 0) && ((this.words.length % n) === 0))) {
        throw new Error("bad key alignment");
      }
      sz = this.words.length / n;
      out = (function() {
        var _i, _ref, _results;
        _results = [];
        for (i = _i = 0, _ref = this.words.length; sz > 0 ? _i < _ref : _i > _ref; i = _i += sz) {
          _results.push(new WordArray(this.words.slice(i, i + sz)));
        }
        return _results;
      }).call(this);
      return out;
    };

    WordArray.prototype.to_utf8 = function() {
      return this.to_buffer().toString('utf8');
    };

    WordArray.prototype.to_hex = function() {
      return this.to_buffer().toString('hex');
    };

    WordArray.prototype.to_ui8a = function() {
      return buffer_to_ui8a(this.to_buffer());
    };

    WordArray.alloc = function(b) {
      if (Buffer.isBuffer(b)) {
        return WordArray.from_buffer(b);
      } else if ((typeof b === 'object') && (b instanceof WordArray)) {
        return b;
      } else if (typeof b === 'string') {
        return WordArray.from_hex(b);
      } else {
        return null;
      }
    };

    WordArray.from_buffer = function(b) {
      var ch, last, p, words;
      words = [];
      p = 0;
      while ((b.length - p) >= 4) {
        words.push(b.readUInt32BE(p));
        p += 4;
      }
      if (p < b.length) {
        last = 0;
        while (p < b.length) {
          ch = b.readUInt8(p);
          last |= ch << (24 - (p % 4) * 8);
          p++;
        }
        last = util.fixup_uint32(last);
        words.push(last);
      }
      return new WordArray(words, b.length);
    };

    WordArray.from_buffer_le = function(b) {
      var ch, last, p, words;
      words = [];
      p = 0;
      while ((b.length - p) >= 4) {
        words.push(b.readUInt32LE(p));
        p += 4;
      }
      if (p < b.length) {
        last = 0;
        while (p < b.length) {
          ch = b.readUInt8(p);
          last |= ch << ((p % 4) * 8);
          p++;
        }
        last = util.fixup_uint32(last);
        words.push(last);
      }
      return new WordArray(words, b.length);
    };

    WordArray.from_utf8 = function(s) {
      return WordArray.from_buffer(new Buffer(s, 'utf8'));
    };

    WordArray.from_utf8_le = function(s) {
      return WordArray.from_buffer_le(new Buffer(s, 'utf8'));
    };

    WordArray.from_hex = function(s) {
      return WordArray.from_buffer(new Buffer(s, 'hex'));
    };

    WordArray.from_hex_le = function(s) {
      return WordArray.from_buffer_le(new Buffer(s, 'hex'));
    };

    WordArray.from_ui8a = function(v) {
      return WordArray.from_buffer(ui8a_to_buffer(v));
    };

    WordArray.from_i32a = function(v) {
      return new WordArray(Array.apply([], v));
    };

    WordArray.prototype.equal = function(wa) {
      var i, ret, w, _i, _len, _ref;
      ret = true;
      if (wa.sigBytes !== this.sigBytes) {
        ret = false;
      } else {
        _ref = this.words;
        for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
          w = _ref[i];
          if (util.fixup_uint32(w) !== util.fixup_uint32(wa.words[i])) {
            ret = false;
          }
        }
      }
      return ret;
    };

    WordArray.prototype.xor = function(wa2, _arg) {
      var dst_offset, i, n_words, src_offset, tmp, _i;
      dst_offset = _arg.dst_offset, src_offset = _arg.src_offset, n_words = _arg.n_words;
      if (!dst_offset) {
        dst_offset = 0;
      }
      if (!src_offset) {
        src_offset = 0;
      }
      if (n_words == null) {
        n_words = wa2.words.length - src_offset;
      }
      if (this.words.length < dst_offset + n_words) {
        throw new Error("dest range exceeded (" + this.words.length + " < " + (dst_offset + n_words) + ")");
      }
      if (wa2.words.length < src_offset + n_words) {
        throw new Error("source range exceeded");
      }
      for (i = _i = 0; 0 <= n_words ? _i < n_words : _i > n_words; i = 0 <= n_words ? ++_i : --_i) {
        tmp = this.words[dst_offset + i] ^ wa2.words[src_offset + i];
        this.words[dst_offset + i] = util.fixup_uint32(tmp);
      }
      return this;
    };

    WordArray.prototype.truncate = function(n_bytes) {
      var n_words;
      if (!(n_bytes <= this.sigBytes)) {
        throw new Error("Cannot truncate: " + n_bytes + " > " + this.sigBytes);
      }
      n_words = Math.ceil(n_bytes / 4);
      return new WordArray(this.words.slice(0, n_words), n_bytes);
    };

    WordArray.prototype.unshift = function(n_words) {
      var ret;
      if (this.words.length >= n_words) {
        ret = this.words.splice(0, n_words);
        this.sigBytes -= n_words * 4;
        return new WordArray(ret);
      } else {
        return null;
      }
    };

    WordArray.prototype.is_scrubbed = function() {
      var w, _i, _len, _ref;
      _ref = this.words;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        w = _ref[_i];
        if (w !== 0) {
          return false;
        }
      }
      return true;
    };

    WordArray.prototype.scrub = function() {
      return util.scrub_vec(this.words);
    };

    WordArray.prototype.slice = function(low, hi) {
      var n, sb;
      n = this.words.length;
      if (!((low < hi) && (hi <= n))) {
        throw new Error("Bad WordArray slice [" + low + "," + hi + ")] when only " + n + " avail");
      }
      sb = (hi - low) * 4;
      if (hi === n) {
        sb -= n * 4 - this.sigBytes;
      }
      return new WordArray(this.words.slice(low, hi), sb);
    };

    return WordArray;

  })();

  exports.X64Word = X64Word = (function() {
    function X64Word(high, low) {
      this.high = high;
      this.low = low;
    }

    X64Word.prototype.clone = function() {
      return new X64Word(this.high, this.low);
    };

    return X64Word;

  })();

  exports.X64WordArray = X64WordArray = (function() {
    function X64WordArray(words, sigBytes) {
      this.sigBytes = sigBytes;
      this.words = words || [];
      if (!this.sigBytes) {
        this.sigBytes = this.words.length * 8;
      }
    }

    X64WordArray.prototype.toX32 = function() {
      var v, w, _i, _len, _ref;
      v = [];
      _ref = this.words;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        w = _ref[_i];
        v.push(w.high);
        v.push(w.low);
      }
      return new WordArray(v, this.sigBytes);
    };

    X64WordArray.prototype.clone = function() {
      var w;
      return new X64WordArray((function() {
        var _i, _len, _ref, _results;
        _ref = this.words;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          w = _ref[_i];
          _results.push(w.clone());
        }
        return _results;
      }).call(this), this.sigBytes);
    };

    return X64WordArray;

  })();

  exports.buffer_to_ui8a = buffer_to_ui8a;

  exports.ui8a_to_buffer = ui8a_to_buffer;

  exports.endian_reverse = endian_reverse;

}).call(this);

}).call(this,require("buffer").Buffer)
},{"./util":37,"buffer":1}],39:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.7.1-f
(function() {
  var Generator, iced, __iced_k, __iced_k_noop;

  iced = require('iced-runtime');
  __iced_k = __iced_k_noop = function() {};

  Generator = Generator = (function() {
    function Generator(opts) {
      opts = opts || {};
      this.lazy_loop_delay = opts.lazy_loop_delay || 30;
      this.loop_delay = opts.loop_delay || 5;
      this.work_min = opts.work_min || 1;
      this.auto_stop_bits = opts.auto_stop_bits || 4096;
      this.max_bits_per_delta = opts.max_bits_per_delta || 4;
      this.auto_stop = opts.auto_stop ? opts.auto_stop : true;
      this.entropies = [];
      this.running = true;
      this.is_generating = false;
      this.timer_race_loop();
    }

    Generator.prototype.generate = function(bits_wanted, cb) {
      var e, harvested_bits, res, ___iced_passed_deferral, __iced_deferrals, __iced_k;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      this.is_generating = true;
      if (!this.running) {
        this.resume();
      }
      harvested_bits = 0;
      res = [];
      (function(_this) {
        return (function(__iced_k) {
          var _results, _while;
          _results = [];
          _while = function(__iced_k) {
            var _break, _continue, _next;
            _break = function() {
              return __iced_k(_results);
            };
            _continue = function() {
              return iced.trampoline(function() {
                return _while(__iced_k);
              });
            };
            _next = function(__iced_next_arg) {
              _results.push(__iced_next_arg);
              return _continue();
            };
            if (!(harvested_bits < bits_wanted)) {
              return _break();
            } else {
              (function(__iced_k) {
                if (_this.entropies.length) {
                  e = _this.entropies.splice(0, 1)[0];
                  harvested_bits += e[1];
                  return __iced_k(res.push(e[0]));
                } else {
                  (function(__iced_k) {
                    __iced_deferrals = new iced.Deferrals(__iced_k, {
                      parent: ___iced_passed_deferral,
                      filename: "/Users/chris/git/more-entropy/src/generator.iced",
                      funcname: "Generator.generate"
                    });
                    _this.delay(__iced_deferrals.defer({
                      lineno: 28
                    }));
                    __iced_deferrals._fulfill();
                  })(__iced_k);
                }
              })(_next);
            }
          };
          _while(__iced_k);
        });
      })(this)((function(_this) {
        return function() {
          if (_this.auto_stop) {
            _this.stop();
          }
          _this.is_generating = false;
          return cb(res);
        };
      })(this));
    };

    Generator.prototype.stop = function() {
      return this.running = false;
    };

    Generator.prototype.resume = function() {
      this.running = true;
      return this.timer_race_loop();
    };

    Generator.prototype.reset = function() {
      this.entropies = [];
      return this.total_bits = 0;
    };

    Generator.prototype.count_unused_bits = function() {
      var bits, e, _i, _len, _ref;
      bits = 0;
      _ref = this.entropies;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        e = _ref[_i];
        bits += e[1];
      }
      return bits;
    };

    Generator.prototype.delay = function(cb) {
      var delay, ___iced_passed_deferral, __iced_deferrals, __iced_k;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      delay = this.is_generating ? this.loop_delay : this.lazy_loop_delay;
      (function(_this) {
        return (function(__iced_k) {
          __iced_deferrals = new iced.Deferrals(__iced_k, {
            parent: ___iced_passed_deferral,
            filename: "/Users/chris/git/more-entropy/src/generator.iced",
            funcname: "Generator.delay"
          });
          setTimeout(__iced_deferrals.defer({
            lineno: 50
          }), delay);
          __iced_deferrals._fulfill();
        });
      })(this)((function(_this) {
        return function() {
          return cb();
        };
      })(this));
    };

    Generator.prototype.timer_race_loop = function() {
      var ___iced_passed_deferral, __iced_k, _results, _while;
      __iced_k = __iced_k_noop;
      ___iced_passed_deferral = iced.findDeferral(arguments);
      this._last_count = null;
      _results = [];
      _while = (function(_this) {
        var count, delta, entropy, v, __iced_deferrals;
        return function(__iced_k) {
          var _break, _continue, _next;
          _break = function() {
            return __iced_k(_results);
          };
          _continue = function() {
            return iced.trampoline(function() {
              return _while(__iced_k);
            });
          };
          _next = function(__iced_next_arg) {
            _results.push(__iced_next_arg);
            return _continue();
          };
          if (!_this.running) {
            return _break();
          } else {
            if (_this.count_unused_bits() < _this.auto_stop_bits) {
              count = _this.millisecond_count();
              if ((_this._last_count != null) && (delta = count - _this._last_count)) {
                entropy = Math.floor(_this.log_2(Math.abs(delta)));
                entropy = Math.min(_this.max_bits_per_delta, entropy);
                v = [delta, entropy];
                _this.entropies.push(v);
              }
              _this._last_count = count;
            }
            (function(__iced_k) {
              __iced_deferrals = new iced.Deferrals(__iced_k, {
                parent: ___iced_passed_deferral,
                filename: "/Users/chris/git/more-entropy/src/generator.iced",
                funcname: "Generator.timer_race_loop"
              });
              _this.delay(__iced_deferrals.defer({
                lineno: 64
              }));
              __iced_deferrals._fulfill();
            })(_next);
          }
        };
      })(this);
      _while(__iced_k);
    };

    Generator.prototype.log_2 = function(x) {
      return Math.log(x) / Math.LN2;
    };

    Generator.prototype.millisecond_count = function() {
      var d, i, x;
      d = Date.now();
      i = x = 0;
      while (Date.now() < d + this.work_min + 1) {
        i++;
        x = Math.sin(Math.sqrt(Math.log(i + x)));
      }
      return i;
    };

    return Generator;

  })();

  if (typeof window !== "undefined" && window !== null) {
    window.Generator = Generator;
  }

  if (typeof exports !== "undefined" && exports !== null) {
    exports.Generator = Generator;
  }

}).call(this);

},{"iced-runtime":13}],40:[function(require,module,exports){
// Generated by IcedCoffeeScript 1.7.1-c
(function() {
  exports.Generator = require('../lib/generator').Generator;

}).call(this);

},{"../lib/generator":39}],41:[function(require,module,exports){
(function (Buffer){
var HMAC_SHA256, WordArray, from_utf8, generate, iced, params, pbkdf2, run, scrypt, util, __iced_k, __iced_k_noop, _ref;

iced = require('iced-runtime');
__iced_k = __iced_k_noop = function() {};

_ref = require('triplesec'), scrypt = _ref.scrypt, pbkdf2 = _ref.pbkdf2, HMAC_SHA256 = _ref.HMAC_SHA256, WordArray = _ref.WordArray, util = _ref.util;

generate = require('keybase-bitcoin').generate;

params = require('../json/params.json');

from_utf8 = function(s, i) {
  var b, b2, ret;
  b = new Buffer(s, 'utf8');
  b2 = Buffer.concat([b, new Buffer([i])]);
  ret = WordArray.from_buffer(b2);
  util.scrub_buffer(b);
  util.scrub_buffer(b2);
  return ret;
};

exports.run = run = function(_arg, cb) {
  var d, d2, k, obj, out, passphrase, progress_hook, s1, s2, salt, seed_final, seeds, v, ___iced_passed_deferral, __iced_deferrals, __iced_k;
  __iced_k = __iced_k_noop;
  ___iced_passed_deferral = iced.findDeferral(arguments);
  passphrase = _arg.passphrase, salt = _arg.salt, progress_hook = _arg.progress_hook;
  d = {};
  seeds = [];
  for (k in params) {
    v = params[k];
    d[k] = v;
  }
  d.key = from_utf8(passphrase, 1);
  d.salt = from_utf8(salt, 1);
  d.progress_hook = progress_hook;
  (function(_this) {
    return (function(__iced_k) {
      __iced_deferrals = new iced.Deferrals(__iced_k, {
        parent: ___iced_passed_deferral
      });
      scrypt(d, __iced_deferrals.defer({
        assign_fn: (function() {
          return function() {
            return s1 = arguments[0];
          };
        })(),
        lineno: 26
      }));
      __iced_deferrals._fulfill();
    });
  })(this)((function(_this) {
    return function() {
      seeds.push(s1.to_buffer());
      d2 = {
        key: from_utf8(passphrase, 2),
        salt: from_utf8(salt, 2),
        c: params.pbkdf2c,
        dkLen: params.dkLen,
        progress_hook: progress_hook,
        klass: HMAC_SHA256
      };
      (function(__iced_k) {
        __iced_deferrals = new iced.Deferrals(__iced_k, {
          parent: ___iced_passed_deferral
        });
        pbkdf2(d2, __iced_deferrals.defer({
          assign_fn: (function() {
            return function() {
              return s2 = arguments[0];
            };
          })(),
          lineno: 38
        }));
        __iced_deferrals._fulfill();
      })(function() {
        var _i, _len, _ref1;
        seeds.push(s2.to_buffer());
        s1.xor(s2, {});
        seed_final = s1.to_buffer();
        seeds.push(seed_final);
        _ref1 = [s1, s2, d.key, d2.key];
        for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
          obj = _ref1[_i];
          obj.scrub();
        }
        out = generate(seed_final);
        out.seeds = seeds;
        return cb(out);
      });
    };
  })(this));
};

}).call(this,require("buffer").Buffer)
},{"../json/params.json":42,"buffer":1,"iced-runtime":13,"keybase-bitcoin":15,"triplesec":26}],42:[function(require,module,exports){
module.exports={ 
  "N"        : 18,
  "p"        : 1,
  "r"        : 8,
  "dkLen"    : 32,
  "pbkdf2c"  : 65536
}

},{}]},{},[41])(41)
});