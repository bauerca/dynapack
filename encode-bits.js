var SETS = {};
SETS[16] = '0123456789abcdef';
SETS[32] = SETS[16] + 'ghijklmnopqrstuv';
SETS[64] = SETS[32] + 'wxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';

/**
 *  @param {Array<Integer>} ones The bit array, where each entry
 *  is an index for a bit that is 1.
 */
module.exports = function(ones, base) {
  base = base || 16;

  var index,
      lastIndex = -1,
      chrBit = 1,
      lastChrBit = base / 2,
      chr = 0,
      result = '',
      set = SETS[base],
      rem,
      i, j;

  ones.sort(function(i, j) {return i - j;});

  for (i = 0; i < ones.length; i++) {
    index = ones[i];
    // Zeros.
    for (j = lastIndex + 1; j < index; j++) {
      setChr();
    }
    // One.
    chr |= chrBit;
    setChr();
    lastIndex = index;
  }

  if (chrBit !== 1) {
    chrBit = lastChrBit;
    setChr();
  }

  return result || set[0];

  // Set character if we are in its last bit; otherwise, go
  // to the next bit.
  function setChr() {
    if (chrBit === lastChrBit) {
      result = set[chr] + result;
      chr = 0;
      chrBit = 1;
    } else {
      chrBit <<= 1;
    }
  }
};

/**
 *  Returns the array of bits that are one in both s1 and s2.
 */
function intersect(s1, s2, base) {
  var mask1 = decode(s1, base),
      mask2 = decode(s2, base),
      i, j = 0;

  // mask1 and mask2 are sorted; so as we go through
  for (i = 0; i < mask1.length; i++) {
    for (; j < mask2.length; j++) {

    }
  }
}

function decode(s, base) {
  base = base || 16;
  var chr,
      i,
      lastIndex = -1,
      chrBit = 1,
      lastChrBit = base / 2,
      chr = 0,
      result = '',
      set = SETS[base],
      rem;

  for (i = 0; i < s.length; i++) {
    setIndex = set.indexOf(s[i]);

  }

}
