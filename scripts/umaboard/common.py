import hashlib
import json
import math


class DataError(ValueError):
    """A source or bundle cannot safely be activated."""


def canonical_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def identifier(value, label='ID'):
    if isinstance(value, bool) or not str(value).isdigit():
        raise DataError(f'{label}: expected a numeric identifier, got {value!r}')
    return str(value)


def number(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise DataError(f'{label}: expected a finite number')
    return value


def rows(value, label):
    if not isinstance(value, list) or not all(isinstance(r, dict) for r in value):
        raise DataError(f'{label}: expected an array of objects')
    if not value:
        raise DataError(f'{label}: empty input')
    return value
