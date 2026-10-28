"""A small QR code encoder (byte mode, error correction M, versions 1 to 9).

It exists so the two-step sign-in set-up screen can show a scannable code without adding a
library. It returns the dark/light grid; the screen draws it. Texts up to 180 bytes fit.
"""

from __future__ import annotations

# version -> (error-correction codewords per block, [(blocks, data codewords per block), ...])
_BLOCKS = {
    1: (10, [(1, 16)]),
    2: (16, [(1, 28)]),
    3: (26, [(1, 44)]),
    4: (18, [(2, 32)]),
    5: (24, [(2, 43)]),
    6: (16, [(4, 27)]),
    7: (18, [(4, 31)]),
    8: (22, [(2, 38), (2, 39)]),
    9: (22, [(3, 36), (2, 37)]),
}
_ALIGN = {
    1: [],
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
}


class QrTooLong(ValueError):
    pass


# --------------------------------------------------------------------------- Reed-Solomon

_EXP = [0] * 512
_LOG = [0] * 256
_x = 1
for _i in range(255):
    _EXP[_i] = _x
    _LOG[_x] = _i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11D
for _i in range(255, 512):
    _EXP[_i] = _EXP[_i - 255]


def _mul(a: int, b: int) -> int:
    return 0 if a == 0 or b == 0 else _EXP[_LOG[a] + _LOG[b]]


def _generator(degree: int) -> list[int]:
    poly = [1]
    for i in range(degree):
        nxt = [0] * (len(poly) + 1)
        for j, coef in enumerate(poly):
            nxt[j] ^= coef
            nxt[j + 1] ^= _mul(coef, _EXP[i])
        poly = nxt
    return poly


def _remainder(data: list[int], degree: int) -> list[int]:
    gen = _generator(degree)
    rest = list(data) + [0] * degree
    for i in range(len(data)):
        factor = rest[i]
        if factor:
            for j, coef in enumerate(gen):
                rest[i + j] ^= _mul(coef, factor)
    return rest[len(data) :]


# --------------------------------------------------------------------------- codewords


def _capacity(version: int) -> int:
    _, groups = _BLOCKS[version]
    return sum(n * size for n, size in groups)


def _data_codewords(payload: bytes, version: int) -> list[int]:
    bits: list[int] = []

    def put(value: int, count: int) -> None:
        bits.extend((value >> i) & 1 for i in range(count - 1, -1, -1))

    put(0b0100, 4)
    put(len(payload), 8)
    for byte in payload:
        put(byte, 8)
    room = _capacity(version) * 8
    put(0, min(4, room - len(bits)))
    while len(bits) % 8:
        bits.append(0)
    words = [int("".join(map(str, bits[i : i + 8])), 2) for i in range(0, len(bits), 8)]
    pad = [0xEC, 0x11]
    while len(words) < _capacity(version):
        words.append(pad[(len(words) - len(bits) // 8) % 2])
    return words


def _interleave(words: list[int], version: int) -> list[int]:
    ecc, groups = _BLOCKS[version]
    blocks: list[list[int]] = []
    at = 0
    for count, size in groups:
        for _ in range(count):
            blocks.append(words[at : at + size])
            at += size
    codes = [_remainder(b, ecc) for b in blocks]
    out: list[int] = []
    for i in range(max(len(b) for b in blocks)):
        out.extend(b[i] for b in blocks if i < len(b))
    for i in range(ecc):
        out.extend(c[i] for c in codes)
    return out


# --------------------------------------------------------------------------- the grid


def _bch(value: int, poly: int, bits: int) -> int:
    rest = value << bits
    top = poly.bit_length() - 1
    for i in range(rest.bit_length() - 1, top - 1, -1):
        if rest >> i & 1:
            rest ^= poly << (i - top)
    return (value << bits) | rest


_MASKS = [
    lambda r, c: (r + c) % 2 == 0,
    lambda r, c: r % 2 == 0,
    lambda r, c: c % 3 == 0,
    lambda r, c: (r + c) % 3 == 0,
    lambda r, c: (r // 2 + c // 3) % 2 == 0,
    lambda r, c: (r * c) % 2 + (r * c) % 3 == 0,
    lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0,
    lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0,
]


class _Grid:
    def __init__(self, version: int) -> None:
        self.n = 17 + 4 * version
        self.version = version
        self.dark = [[False] * self.n for _ in range(self.n)]
        self.fixed = [[False] * self.n for _ in range(self.n)]
        self._patterns()

    def put(self, r: int, c: int, value: bool) -> None:
        self.dark[r][c] = value
        self.fixed[r][c] = True

    def _finder(self, top: int, left: int) -> None:
        for dr in range(-1, 8):
            for dc in range(-1, 8):
                r, c = top + dr, left + dc
                if not (0 <= r < self.n and 0 <= c < self.n):
                    continue
                ring = max(abs(dr - 3), abs(dc - 3))
                inside = 0 <= dr <= 6 and 0 <= dc <= 6
                self.put(r, c, inside and ring != 2)

    def _patterns(self) -> None:
        n = self.n
        self._finder(0, 0)
        self._finder(0, n - 7)
        self._finder(n - 7, 0)
        positions = _ALIGN[self.version]
        for r in positions:
            for c in positions:
                if (r, c) in ((6, 6), (6, positions[-1]), (positions[-1], 6)) and len(
                    positions
                ) > 1:
                    if (r, c) != (positions[-1], positions[-1]):
                        continue
                for dr in range(-2, 3):
                    for dc in range(-2, 3):
                        self.put(r + dr, c + dc, max(abs(dr), abs(dc)) != 1)
        for i in range(8, n - 8):
            self.put(6, i, i % 2 == 0)
            self.put(i, 6, i % 2 == 0)
        self.put(n - 8, 8, True)  # the always-dark module
        for i in range(9):  # reserve the format areas
            for r, c in ((8, i), (i, 8)):
                self.fixed[r][c] = True
        for i in range(8):
            self.fixed[8][n - 1 - i] = True
            self.fixed[n - 1 - i][8] = True
        if self.version >= 7:
            for i in range(6):
                for j in range(3):
                    self.fixed[i][n - 11 + j] = True
                    self.fixed[n - 11 + j][i] = True

    def place(self, data: list[int]) -> None:
        bits = [(w >> i) & 1 for w in data for i in range(7, -1, -1)]
        n, at, up = self.n, 0, True
        c = n - 1
        while c > 0:
            if c == 6:
                c -= 1
            rows = range(n - 1, -1, -1) if up else range(n)
            for r in rows:
                for dc in (0, 1):
                    cc = c - dc
                    if not self.fixed[r][cc]:
                        self.dark[r][cc] = bool(bits[at]) if at < len(bits) else False
                        at += 1
            up = not up
            c -= 2

    def masked(self, mask: int) -> list[list[bool]]:
        grid = [row[:] for row in self.dark]
        fn = _MASKS[mask]
        for r in range(self.n):
            for c in range(self.n):
                if not self.fixed[r][c] and fn(r, c):
                    grid[r][c] = not grid[r][c]
        n = self.n
        fmt = _bch(mask, 0x537, 10) ^ 0x5412  # error correction M is 00
        for i in range(15):
            bit = bool(fmt >> i & 1)
            # first copy around the top-left finder
            if i < 6:
                grid[i][8] = bit
            elif i < 8:
                grid[i + 1][8] = bit
            elif i == 8:
                grid[8][7] = bit
            else:
                grid[8][14 - i] = bit
            # second copy beside the other two finders
            if i < 8:
                grid[8][n - 1 - i] = bit
            else:
                grid[n - 15 + i][8] = bit
        if self.version >= 7:
            info = _bch(self.version, 0x1F25, 12)
            for i in range(18):
                bit = bool(info >> i & 1)
                grid[i // 3][n - 11 + i % 3] = bit
                grid[n - 11 + i % 3][i // 3] = bit
        return grid


def _penalty(grid: list[list[bool]]) -> int:
    n = len(grid)
    score = 0
    for lines in (grid, [list(col) for col in zip(*grid, strict=True)]):
        for line in lines:
            run = 1
            for i in range(1, n):
                if line[i] == line[i - 1]:
                    run += 1
                else:
                    score += run - 2 if run >= 5 else 0
                    run = 1
            score += run - 2 if run >= 5 else 0
            text = "".join("1" if v else "0" for v in line)
            for pat in ("10111010000", "00001011101"):
                start = text.find(pat)
                while start != -1:
                    score += 40
                    start = text.find(pat, start + 1)
    for r in range(n - 1):
        for c in range(n - 1):
            if grid[r][c] == grid[r][c + 1] == grid[r + 1][c] == grid[r + 1][c + 1]:
                score += 3
    dark = sum(row.count(True) for row in grid)
    score += abs(dark * 20 - n * n * 10) // (n * n) * 10
    return score


def encode(text: str) -> list[str]:
    """Rows of "1" (dark) and "0" (light), without the quiet zone."""
    payload = text.encode("utf-8")
    for version in range(1, 10):
        room = _capacity(version) - 2
        if len(payload) <= room:
            break
    else:
        raise QrTooLong("That text is too long for this QR code.")
    words = _interleave(_data_codewords(payload, version), version)
    grid = _Grid(version)
    grid.place(words)
    best = min((grid.masked(m) for m in range(8)), key=_penalty)
    return ["".join("1" if v else "0" for v in row) for row in best]
