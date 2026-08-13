function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function requireUserId(value, res) {
  if (!validId(value)) {
    res.status(400).json({ message: 'A valid userId is required.' });
    return false;
  }
  return true;
}

module.exports = { validId, requireUserId };
