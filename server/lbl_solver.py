"""
7-Stage Layer-by-Layer (LBL) Teaching Solver for 《学Cube》 V1.0.

Facelet index layout (54 chars, URFDLB order):
  U: 0..8   R: 9..17   F: 18..26   D: 27..35   L: 36..44   B: 45..53
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

SOLVED_FACELETS = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"

# Exact clockwise 90-degree sticker cycles (source -> destination: new[dst] = old[src])
# Verified to match standard Singmaster notation & Three.js cubeSerializer.ts.
_BASE_CYCLES: Dict[str, List[Tuple[int, int, int, int]]] = {
    "U": [
        (0, 2, 8, 6), (1, 5, 7, 3),
        (18, 36, 45, 9), (19, 37, 46, 10), (20, 38, 47, 11),
    ],
    "R": [
        (9, 11, 17, 15), (10, 14, 16, 12),
        (2, 51, 29, 20), (5, 48, 32, 23), (8, 45, 35, 26),
    ],
    "F": [
        (18, 20, 26, 24), (19, 23, 25, 21),
        (6, 9, 29, 44), (7, 12, 28, 41), (8, 15, 27, 38),
    ],
    "D": [
        (27, 29, 35, 33), (28, 32, 34, 30),
        (24, 15, 51, 42), (25, 16, 52, 43), (26, 17, 53, 44),
    ],
    "L": [
        (36, 38, 44, 42), (37, 41, 43, 39),
        (0, 18, 27, 53), (3, 21, 30, 50), (6, 24, 33, 47),
    ],
    "B": [
        (45, 47, 53, 51), (46, 50, 52, 48),
        (2, 36, 33, 17), (1, 39, 34, 14), (0, 42, 35, 11),
    ],
}


def _build_perm(cycles: List[Tuple[int, int, int, int]]) -> List[int]:
    perm = list(range(54))
    for a, b, c, d in cycles:
        # a -> b -> c -> d -> a
        perm[b] = a
        perm[c] = b
        perm[d] = c
        perm[a] = d
    return perm


_BASE_PERMS: Dict[str, List[int]] = {
    face: _build_perm(cycles) for face, cycles in _BASE_CYCLES.items()
}

# Face rotation map when rotating the reference front face by k clockwise steps around U:
# k=0: F is front (F, R, B, L)
# k=1: R is front (R, B, L, F)
# k=2: B is front (B, L, F, R)
# k=3: L is front (L, F, R, B)
_RING = ["F", "R", "B", "L"]


def rotate_face_name(face: str, k: int) -> str:
    if face in ("U", "D"):
        return face
    idx = _RING.index(face)
    return _RING[(idx + k) % 4]


def rotate_moves_y(moves: List[str], k: int) -> List[str]:
    if k % 4 == 0:
        return list(moves)
    out: List[str] = []
    for m in moves:
        out.append(rotate_face_name(m[0], k) + m[1:])
    return out


def simplify_moves(moves: List[str]) -> List[str]:
    """Cancel adjacent same-face moves into minimal Singmaster tokens."""
    stack: List[Tuple[str, int]] = []
    for tok in moves:
        face = tok[0]
        suffix = tok[1:]
        amt = 1 if suffix == "" else (3 if suffix == "'" else 2)
        if stack and stack[-1][0] == face:
            combined = (stack[-1][1] + amt) % 4
            if combined == 0:
                stack.pop()
            else:
                stack[-1] = (face, combined)
        else:
            stack.append((face, amt))
    result: List[str] = []
    for face, amt in stack:
        if amt == 1:
            result.append(face)
        elif amt == 2:
            result.append(f"{face}2")
        elif amt == 3:
            result.append(f"{face}'")
    return result


class CubeState:
    def __init__(self, facelets: str = SOLVED_FACELETS):
        if len(facelets) != 54:
            raise ValueError(f"Expected 54 facelets, got {len(facelets)}")
        self.s = list(facelets)

    def copy(self) -> "CubeState":
        return CubeState("".join(self.s))

    def to_string(self) -> str:
        return "".join(self.s)

    def is_solved(self) -> bool:
        return self.to_string() == SOLVED_FACELETS

    def apply_move(self, token: str) -> None:
        face = token[0]
        suffix = token[1:]
        if face not in _BASE_PERMS:
            raise ValueError(f"Unknown move: {token}")
        times = 1 if suffix == "" else (3 if suffix == "'" else 2)
        perm = _BASE_PERMS[face]
        for _ in range(times):
            cur = self.s
            self.s = [cur[perm[i]] for i in range(54)]

    def apply_moves(self, tokens: List[str]) -> None:
        for t in tokens:
            self.apply_move(t)


# Facelet indices for edges and corners
EDGE_SLOTS: Dict[str, Tuple[int, int]] = {
    "UF": (7, 19), "UR": (5, 10), "UB": (1, 46), "UL": (3, 37),
    "DF": (28, 25), "DR": (32, 16), "DB": (34, 52), "DL": (30, 43),
    "FR": (23, 12), "RB": (14, 48), "BL": (50, 39), "LF": (41, 21),
}

CORNER_SLOTS: Dict[str, Tuple[int, int, int]] = {
    "UFR": (8, 20, 9), "URB": (2, 11, 45), "UBL": (0, 47, 36), "ULF": (6, 38, 18),
    "DFR": (29, 26, 15), "DRB": (35, 17, 51), "DBL": (33, 53, 42), "DLF": (27, 44, 24),
}

FACE_CN_NAMES = {
    "U": "紫面(顶)",
    "D": "黄面(底)",
    "F": "绿面(前)",
    "R": "红面(右)",
    "B": "蓝面(后)",
    "L": "橙面(左)",
}


@dataclass
class SubStep:
    tip: str
    formulaName: str
    formulaDesc: str
    moves: List[str] = field(default_factory=list)


@dataclass
class StageResult:
    id: str
    index: int
    title: str
    goal: str
    idea: str
    skipped: bool
    subSteps: List[SubStep]


def _find_edge(cube: CubeState, c1: str, c2: str) -> Tuple[str, Tuple[str, str]]:
    for slot, (i1, i2) in EDGE_SLOTS.items():
        v1, v2 = cube.s[i1], cube.s[i2]
        if (v1 == c1 and v2 == c2) or (v1 == c2 and v2 == c1):
            return slot, (v1, v2)
    raise ValueError(f"Edge ({c1}, {c2}) not found in cube state")


def _find_corner(cube: CubeState, colors: set) -> Tuple[str, Tuple[str, str, str]]:
    for slot, (i1, i2, i3) in CORNER_SLOTS.items():
        vals = (cube.s[i1], cube.s[i2], cube.s[i3])
        if set(vals) == colors:
            return slot, vals
    raise ValueError(f"Corner {colors} not found in cube state")


def _u_align_moves(from_k: int, to_k: int) -> List[str]:
    """Moves on U to rotate a piece at ring position from_k (0=F,1=R,2=B,3=L) to to_k."""
    # U clockwise moves F(0) -> L(3) -> B(2) -> R(1) -> F(0), i.e., k -> (k - 1) % 4
    diff = (from_k - to_k) % 4
    if diff == 0:
        return []
    if diff == 1:
        return ["U"]
    if diff == 2:
        return ["U2"]
    return ["U'"]


def _solve_step1_cross(cube: CubeState) -> StageResult:
    sub_steps: List[SubStep] = []
    targets = [("F", 0), ("R", 1), ("B", 2), ("L", 3)]

    for side, k in targets:
        target_slot = f"D{side}"
        slot, vals = _find_edge(cube, "D", side)
        if slot == target_slot and vals == ("D", side):
            continue

        moves: List[str] = []
        # 1. Bring edge to U layer without breaking earlier solved D-edges
        if slot.startswith("D"):
            s_face = slot[1]
            # Flip/lift from D layer up to U layer
            lift = [f"{s_face}2"]
            cube.apply_moves(lift)
            moves.extend(lift)
            slot, vals = _find_edge(cube, "D", side)
        elif slot in ("FR", "RB", "BL", "LF"):
            # Lift middle-layer edge to U and restore the side face so D-cross stays intact
            # For FR (k_mid=0): R U R' lifts FR to UF/UR without breaking D-cross!
            mid_k = {"FR": 0, "RB": 1, "BL": 2, "LF": 3}[slot]
            lift = rotate_moves_y(["R", "U", "R'"], mid_k)
            cube.apply_moves(lift)
            moves.extend(lift)
            slot, vals = _find_edge(cube, "D", side)

        # 2. Now edge is guaranteed in U layer: UF(0), UR(1), UB(2), UL(3)
        u_k = {"UF": 0, "UR": 1, "UB": 2, "UL": 3}[slot]
        align = _u_align_moves(u_k, k)
        cube.apply_moves(align)
        moves.extend(align)

        # Check orientation at U{side}
        u_idx, s_idx = EDGE_SLOTS[f"U{side}"]
        if cube.s[u_idx] == "D":
            insert = [f"{side}2"]
            desc = "顶层对齐侧面中心后旋转 180° 落到底层"
        else:
            # D is on side face -> U' R' F R (relative to k) preserves all other D edges
            insert = rotate_moves_y(["U'", "R'", "F", "R"], k)
            desc = "侧翻调整朝向后顺势归位，同时保护已拼好的底棱"
        cube.apply_moves(insert)
        moves.extend(insert)

        cleaned = simplify_moves(moves)
        if cleaned:
            sub_steps.append(
                SubStep(
                    tip=f"归位底层「黄-{FACE_CN_NAMES[side][:1]}」棱块，对齐{FACE_CN_NAMES[side]}中心",
                    formulaName="底层十字直觉归位",
                    formulaDesc=desc,
                    moves=cleaned,
                )
            )

    return StageResult(
        id="cross",
        index=1,
        title="底层十字",
        goal="在底面（黄色面）拼出十字，且 4 个底层棱块侧面与各自中心块同色对齐",
        idea="中心块固定不变，决定了每一面的颜色。先把带黄色的棱块提到顶层，旋转顶层对齐侧面颜色，再翻到底层即可。",
        skipped=len(sub_steps) == 0,
        subSteps=sub_steps,
    )


def _solve_step2_first_corners(cube: CubeState) -> StageResult:
    sub_steps: List[SubStep] = []
    # (slot_name, right_face, front_face, k_ring)
    targets = [
        ("DFR", "F", "R", 0),
        ("DRB", "R", "B", 1),
        ("DBL", "B", "L", 2),
        ("DLF", "L", "F", 3),
    ]

    for slot_name, f_face, r_face, k in targets:
        color_set = {"D", f_face, r_face}
        slot, vals = _find_corner(cube, color_set)
        if slot == slot_name and vals == ("D", f_face, r_face):
            continue

        moves: List[str] = []
        # 1. If trapped in D layer, pop up to U layer
        if slot.startswith("D"):
            pop_k = {"DFR": 0, "DRB": 1, "DBL": 2, "DLF": 3}[slot]
            pop = rotate_moves_y(["R", "U", "R'"], pop_k)
            cube.apply_moves(pop)
            moves.extend(pop)
            slot, vals = _find_corner(cube, color_set)

        # 2. Align above target slot (UFR=0, URB=1, UBL=2, ULF=3)
        u_k = {"UFR": 0, "URB": 1, "UBL": 2, "ULF": 3}[slot]
        align = _u_align_moves(u_k, k)
        cube.apply_moves(align)
        moves.extend(align)

        # 3. Inspect orientation at U-slot relative to k
        u_slot = ["UFR", "URB", "UBL", "ULF"][k]
        u_i, f_i, r_i = CORNER_SLOTS[u_slot]
        if cube.s[r_i] == "D":
            # D faces right -> R U R'
            ins = rotate_moves_y(["R", "U", "R'"], k)
            fname = "右手上勾下回（侧入）"
            fdesc = "黄色朝向右侧，直接抬起右侧接住角块后复位"
        elif cube.s[f_i] == "D":
            # D faces front -> U R U' R'
            ins = rotate_moves_y(["U", "R", "U'", "R'"], k)
            fname = "顶转侧入公式"
            fdesc = "黄色朝向前侧，先让开角块、抬槽再合入"
        else:
            # D faces up -> R U2 R' U' R U R'
            ins = rotate_moves_y(["R", "U2", "R'", "U'", "R", "U", "R'"], k)
            fname = "顶面翻角归位"
            fdesc = "黄色朝上时，先翻到侧面再按标准方式落入底槽"

        cube.apply_moves(ins)
        moves.extend(ins)
        cleaned = simplify_moves(moves)
        if cleaned:
            sub_steps.append(
                SubStep(
                    tip=f"归位「黄-{FACE_CN_NAMES[f_face][:1]}-{FACE_CN_NAMES[r_face][:1]}」底层角块",
                    formulaName=fname,
                    formulaDesc=fdesc,
                    moves=cleaned,
                )
            )

    return StageResult(
        id="first_corners",
        index=2,
        title="底层角块归位",
        goal="还原底层 4 个角块，使整个第一层完整拼好且四周呈倒 T 字",
        idea="先把目标角块转到对应槽位正上方，再根据黄色朝向（朝右、朝前或朝上）用“上勾下回”的变式优雅落槽。",
        skipped=len(sub_steps) == 0,
        subSteps=sub_steps,
    )


def _solve_step3_middle_edges(cube: CubeState) -> StageResult:
    sub_steps: List[SubStep] = []
    targets = [
        ("FR", "F", "R", 0),
        ("RB", "R", "B", 1),
        ("BL", "B", "L", 2),
        ("LF", "L", "F", 3),
    ]

    for slot_name, f_face, r_face, _k in targets:
        slot, vals = _find_edge(cube, f_face, r_face)
        if slot == slot_name and vals == (f_face, r_face):
            continue

        moves: List[str] = []
        # If stuck in middle layer, pop out to U using right-insert at that slot
        if slot in ("FR", "RB", "BL", "LF"):
            pop_k = {"FR": 0, "RB": 1, "BL": 2, "LF": 3}[slot]
            pop = rotate_moves_y(["U", "R", "U'", "R'", "U'", "F'", "U", "F"], pop_k)
            cube.apply_moves(pop)
            moves.extend(pop)
            slot, vals = _find_edge(cube, f_face, r_face)

        # Now in U layer
        u_k = {"UF": 0, "UR": 1, "UB": 2, "UL": 3}[slot]
        u_idx, side_idx = EDGE_SLOTS[slot]
        side_color = cube.s[side_idx]
        top_color = cube.s[u_idx]

        # Align side_color with its center face
        center_k = _RING.index(side_color)
        align = _u_align_moves(u_k, center_k)
        cube.apply_moves(align)
        moves.extend(align)

        # Determine whether top_color belongs to the right or left of center_k
        right_face_of_center = _RING[(center_k + 1) % 4]
        if top_color == right_face_of_center:
            ins = rotate_moves_y(["U", "R", "U'", "R'", "U'", "F'", "U", "F"], center_k)
            fname = "中层向右入槽"
            fdesc = "口诀：远离目标 → 抬右 → 回顶 → 落右 → 补底角"
        else:
            ins = rotate_moves_y(["U'", "L'", "U", "L", "U", "F", "U'", "F'"], center_k)
            fname = "中层向左入槽"
            fdesc = "口诀：远离目标 → 抬左 → 回顶 → 落左 → 补底角"

        cube.apply_moves(ins)
        moves.extend(ins)
        cleaned = simplify_moves(moves)
        if cleaned:
            sub_steps.append(
                SubStep(
                    tip=f"归位中层「{FACE_CN_NAMES[f_face][:1]}-{FACE_CN_NAMES[r_face][:1]}」棱块",
                    formulaName=fname,
                    formulaDesc=fdesc,
                    moves=cleaned,
                )
            )

    return StageResult(
        id="middle_edges",
        index=3,
        title="中层棱块归位",
        goal="还原中间层 4 个棱块，完成魔方前两层",
        idea="在顶层找到不含顶色（紫色）的棱块，先将侧面颜色与中心对齐，再判断它应该进入左侧还是右侧槽位，使用对称的 8 步入槽公式。",
        skipped=len(sub_steps) == 0,
        subSteps=sub_steps,
    )


def _solve_step4_top_cross(cube: CubeState) -> StageResult:
    sub_steps: List[SubStep] = []
    # U edge indices: U1(UB)=1, U5(UR)=5, U7(UF)=7, U3(UL)=3
    for _ in range(4):
        ub = cube.s[1] == "U"
        ur = cube.s[5] == "U"
        uf = cube.s[7] == "U"
        ul = cube.s[3] == "U"
        count = sum((ub, ur, uf, ul))
        if count == 4:
            break

        moves: List[str] = []
        if count == 0:
            # Dot case
            alg = ["F", "R", "U", "R'", "U'", "F'"]
            cube.apply_moves(alg)
            moves.extend(alg)
            sub_steps.append(
                SubStep(
                    tip="当前顶面呈「中心点」形态，做一次公式转为折线（L 形）",
                    formulaName="顶层翻十字公式",
                    formulaDesc="F R U R' U' F'（前顺 + 上勾下回 + 前逆）",
                    moves=moves,
                )
            )
        elif (ul and ur) or (ub and uf):
            # Line case -> align horizontal (UL and UR)
            if ub and uf:
                cube.apply_move("U")
                moves.append("U")
            alg = ["F", "R", "U", "R'", "U'", "F'"]
            cube.apply_moves(alg)
            moves.extend(alg)
            sub_steps.append(
                SubStep(
                    tip="当前顶面呈「一字」形态，横放后做一次公式即可拼出顶层十字",
                    formulaName="顶层翻十字公式",
                    formulaDesc="F R U R' U' F'（一字 → 十字）",
                    moves=simplify_moves(moves),
                )
            )
        else:
            # L-shape -> rotate U so UB and UL are U (9 o'clock / back-left)
            u_turns = 0
            while not (cube.s[1] == "U" and cube.s[3] == "U"):
                cube.apply_move("U")
                u_turns += 1
            if u_turns == 1:
                moves.append("U")
            elif u_turns == 2:
                moves.append("U2")
            elif u_turns == 3:
                moves.append("U'")
            alg = ["F", "R", "U", "R'", "U'", "F'"]
            cube.apply_moves(alg)
            moves.extend(alg)
            sub_steps.append(
                SubStep(
                    tip="当前顶面呈「折线（L 形）」，转到左上角（9点钟方向）后执行公式转为一字",
                    formulaName="顶层翻十字公式",
                    formulaDesc="F R U R' U' F'（折线 → 一字）",
                    moves=simplify_moves(moves),
                )
            )

    return StageResult(
        id="top_cross",
        index=4,
        title="顶层十字",
        goal="在顶面（紫色面）翻出紫色十字（暂不管侧面颜色对齐）",
        idea="只需记住一个核心公式 F R U R' U' F'，按「中心点 → 折线（放左上）→ 一字（横放）→ 十字」的固定路径递进。",
        skipped=len(sub_steps) == 0,
        subSteps=sub_steps,
    )


def _solve_step5_top_face(cube: CubeState) -> StageResult:
    sub_steps: List[SubStep] = []
    # U corner indices: UBL=0, URB=2, ULF=6, UFR=8
    for _ in range(5):
        u_corners = [cube.s[0] == "U", cube.s[2] == "U", cube.s[6] == "U", cube.s[8] == "U"]
        oriented = sum(u_corners)
        if oriented == 4:
            break

        moves: List[str] = []
        if oriented == 1:
            # Fish! Align oriented corner to ULF (index 6)
            u_turns = 0
            while cube.s[6] != "U":
                cube.apply_move("U")
                u_turns += 1
            if u_turns == 1:
                moves.append("U")
            elif u_turns == 2:
                moves.append("U2")
            elif u_turns == 3:
                moves.append("U'")

            # Check if UFR's front sticker (F2 = 20) is U -> standard right Sune solves in 1!
            if cube.s[20] == "U":
                alg = ["R", "U", "R'", "U", "R", "U2", "R'"]
                cube.apply_moves(alg)
                moves.extend(alg)
                sub_steps.append(
                    SubStep(
                        tip="出现「右手小鱼」，鱼头朝向左前方，执行右手小鱼公式一步翻全顶",
                        formulaName="右手小鱼公式（Sune）",
                        formulaDesc="R U R' U R U2 R'",
                        moves=simplify_moves(moves),
                    )
                )
            else:
                # Left Sune: rotate oriented corner to UFR (8) and do L' U' L U' L' U2 L
                cube.apply_move("U'")
                moves.append("U'")
                alg = ["L'", "U'", "L", "U'", "L'", "U2", "L"]
                cube.apply_moves(alg)
                moves.extend(alg)
                sub_steps.append(
                    SubStep(
                        tip="出现「左手小鱼」，鱼头朝向右前方，执行左手小鱼公式一步翻全顶",
                        formulaName="左手小鱼公式（Anti-Sune）",
                        formulaDesc="L' U' L U' L' U2 L",
                        moves=simplify_moves(moves),
                    )
                )
        elif oriented == 0:
            # Cross case: align so LUB (L0 = 36) has 'U'
            u_turns = 0
            while cube.s[36] != "U":
                cube.apply_move("U")
                u_turns += 1
            if u_turns == 1:
                moves.append("U")
            elif u_turns == 2:
                moves.append("U2")
            elif u_turns == 3:
                moves.append("U'")
            alg = ["R", "U", "R'", "U", "R", "U2", "R'"]
            cube.apply_moves(alg)
            moves.extend(alg)
            sub_steps.append(
                SubStep(
                    tip="顶面 0 个角块朝上，将左侧后角紫色朝左摆放，执行小鱼公式转为鱼形",
                    formulaName="小鱼公式过渡",
                    formulaDesc="R U R' U R U2 R'",
                    moves=simplify_moves(moves),
                )
            )
        else:
            # 2 corners oriented: align so ULF's front sticker (F0 = 18) is 'U'
            u_turns = 0
            while cube.s[18] != "U":
                cube.apply_move("U")
                u_turns += 1
            if u_turns == 1:
                moves.append("U")
            elif u_turns == 2:
                moves.append("U2")
            elif u_turns == 3:
                moves.append("U'")
            alg = ["R", "U", "R'", "U", "R", "U2", "R'"]
            cube.apply_moves(alg)
            moves.extend(alg)
            sub_steps.append(
                SubStep(
                    tip="顶面 2 个角块朝上，将左前角紫色朝前摆放，执行小鱼公式转为鱼形",
                    formulaName="小鱼公式过渡",
                    formulaDesc="R U R' U R U2 R'",
                    moves=simplify_moves(moves),
                )
            )

    return StageResult(
        id="top_face",
        index=5,
        title="顶层翻色（全顶同色）",
        goal="让顶层 4 个角块的紫色全部翻到顶面，实现整个顶面全紫",
        idea="核心是「小鱼公式」：先通过 1 次公式将任意非鱼形态转化为“1角朝上的鱼形”，再把鱼头对准左前/右前执行对应小鱼公式一步封顶。",
        skipped=len(sub_steps) == 0,
        subSteps=sub_steps,
    )


def _headlight_sides(cube: CubeState) -> List[str]:
    """Return sides among F, R, B, L whose two upper corners share the same color."""
    checks = {
        "F": (18, 20),
        "R": (9, 11),
        "B": (45, 47),
        "L": (36, 38),
    }
    return [side for side, (a, b) in checks.items() if cube.s[a] == cube.s[b]]


def _solve_step6_top_corners(cube: CubeState) -> StageResult:
    sub_steps: List[SubStep] = []
    # Aa-perm / beginner headlights alg: R' F R' B2 R F' R' B2 R2
    # Keeps back two corners (UBL, URB) matched when headlights are on B!
    corner_alg = ["R'", "F", "R'", "B2", "R", "F'", "R'", "B2", "R2"]

    for _ in range(3):
        hl = _headlight_sides(cube)
        if len(hl) == 4:
            break

        moves: List[str] = []
        if len(hl) >= 1:
            # Place headlights on Back (B, ring index 2)
            hl_k = _RING.index(hl[0])
            align = _u_align_moves(hl_k, 2)
            cube.apply_moves(align)
            moves.extend(align)
            cube.apply_moves(corner_alg)
            moves.extend(corner_alg)
            sub_steps.append(
                SubStep(
                    tip="找到一对同色角块（「眼睛」），转到背面后执行角块归位公式",
                    formulaName="顶层角块归位公式",
                    formulaDesc="R' F R' B2 R F' R' B2 R2",
                    moves=simplify_moves(moves),
                )
            )
        else:
            cube.apply_moves(corner_alg)
            moves.extend(corner_alg)
            sub_steps.append(
                SubStep(
                    tip="四面均无同色角块，先执行一次角块公式制造出一对「眼睛」",
                    formulaName="角块公式过渡",
                    formulaDesc="R' F R' B2 R F' R' B2 R2",
                    moves=moves,
                )
            )

    # Align top corners with side centers so Step 7 is super clean to read
    align_u: List[str] = []
    u_turns = 0
    while cube.s[18] != "F":
        cube.apply_move("U")
        u_turns += 1
    if u_turns == 1:
        align_u.append("U")
    elif u_turns == 2:
        align_u.append("U2")
    elif u_turns == 3:
        align_u.append("U'")
    if align_u:
        sub_steps.append(
            SubStep(
                tip="微调顶层，使 4 个顶角侧面与对应中心块对齐",
                formulaName="顶层对齐",
                formulaDesc="对齐四角颜色，为最后一步棱块轮换做准备",
                moves=align_u,
            )
        )

    return StageResult(
        id="top_corners",
        index=6,
        title="顶层角块归位",
        goal="调整顶层 4 个角块的水平位置，使每面顶部两角同色并与侧面中心对齐",
        idea="观察顶层四周寻找一对同色角块（俗称“眼睛”），将其转到背面保护起来，再用角块交换公式让前方两角归位。",
        skipped=len(sub_steps) == 0,
        subSteps=sub_steps,
    )


def _solved_top_edge_sides(cube: CubeState) -> List[str]:
    checks = {"F": 19, "R": 10, "B": 46, "L": 37}
    return [side for side, idx in checks.items() if cube.s[idx] == side]


def _solve_step7_top_edges(cube: CubeState) -> StageResult:
    sub_steps: List[SubStep] = []
    # Ua: R U' R U R U R U' R' U' R2 (cycles UF -> UL -> UR -> UF or reverse; we test both!)
    ua_alg = ["R", "U'", "R", "U", "R", "U", "R", "U'", "R'", "U'", "R2"]
    ub_alg = ["R2", "U", "R", "U", "R'", "U'", "R'", "U'", "R'", "U", "R'"]

    for _ in range(3):
        if cube.is_solved():
            break
        solved_sides = _solved_top_edge_sides(cube)
        if len(solved_sides) == 4:
            break

        if len(solved_sides) == 1:
            # Put the single solved face on Back (k = 2) by rotating the algorithm via y-mapping!
            # If solved face is at ring index s_k, then front face relative to it is (s_k + 2) % 4
            s_k = _RING.index(solved_sides[0])
            front_k = (s_k + 2) % 4

            test_a = cube.copy()
            moves_a = rotate_moves_y(ua_alg, front_k)
            test_a.apply_moves(moves_a)
            if test_a.is_solved():
                cube.apply_moves(moves_a)
                sub_steps.append(
                    SubStep(
                        tip=f"{FACE_CN_NAMES[solved_sides[0]]}已完整归位，以它为背面执行三棱轮换公式完成还原",
                        formulaName="顶层三棱轮换（Ua）",
                        formulaDesc="逆时针/定向轮换其余 3 个顶层棱块",
                        moves=moves_a,
                    )
                )
            else:
                moves_b = rotate_moves_y(ub_alg, front_k)
                cube.apply_moves(moves_b)
                sub_steps.append(
                    SubStep(
                        tip=f"{FACE_CN_NAMES[solved_sides[0]]}已完整归位，以它为背面执行三棱轮换公式完成还原",
                        formulaName="顶层三棱轮换（Ub）",
                        formulaDesc="顺时针/反向轮换其余 3 个顶层棱块",
                        moves=moves_b,
                    )
                )
        else:
            # 0 edges solved (H-perm or Z-perm) -> apply Ua once to create 1 solved side
            cube.apply_moves(ua_alg)
            sub_steps.append(
                SubStep(
                    tip="顶层 4 个棱块均未归位，先执行一次三棱轮换公式使其中一面先归位",
                    formulaName="三棱轮换过渡",
                    formulaDesc="R U' R U R U R U' R' U' R2",
                    moves=list(ua_alg),
                )
            )

    return StageResult(
        id="top_edges",
        index=7,
        title="顶层棱块归位",
        goal="轮换顶层最后 3~4 个棱块，彻底还原整个三阶魔方",
        idea="先找到已经完整还原的一整面放到背面保护，再根据剩余 3 个棱块的顺/逆时针流向执行一次三棱轮换公式即可完美收官。",
        skipped=len(sub_steps) == 0,
        subSteps=sub_steps,
    )


def validate_facelets(facelets: str) -> Optional[str]:
    if len(facelets) != 54:
        return f"魔方状态长度应为 54，实际收到 {len(facelets)}"
    for ch in ("U", "R", "F", "D", "L", "B"):
        if facelets.count(ch) != 9:
            return f"颜色 {ch} 数量应为 9，实际为 {facelets.count(ch)}"
    return None


def solve_lbl(facelets: str) -> dict:
    err = validate_facelets(facelets)
    if err:
        return {"solvable": False, "method": "lbl", "totalMoves": 0, "stages": [], "error": err}

    cube = CubeState(facelets)
    if cube.is_solved():
        return {
            "solvable": True,
            "method": "lbl",
            "totalMoves": 0,
            "stages": [
                {
                    "id": s_id,
                    "index": idx,
                    "title": title,
                    "goal": goal,
                    "idea": idea,
                    "skipped": True,
                    "subSteps": [],
                }
                for idx, (s_id, title, goal, idea) in enumerate(
                    [
                        ("cross", "底层十字", "底面已拼好十字", "已完成"),
                        ("first_corners", "底层角块归位", "底层四角已归位", "已完成"),
                        ("middle_edges", "中层棱块归位", "中层四棱已归位", "已完成"),
                        ("top_cross", "顶层十字", "顶面已拼好十字", "已完成"),
                        ("top_face", "顶层翻色（全顶同色）", "顶面已全同色", "已完成"),
                        ("top_corners", "顶层角块归位", "顶层四角已归位", "已完成"),
                        ("top_edges", "顶层棱块归位", "魔方已完全还原", "已完成"),
                    ],
                    start=1,
                )
            ],
        }

    stages = [
        _solve_step1_cross(cube),
        _solve_step2_first_corners(cube),
        _solve_step3_middle_edges(cube),
        _solve_step4_top_cross(cube),
        _solve_step5_top_face(cube),
        _solve_step6_top_corners(cube),
        _solve_step7_top_edges(cube),
    ]

    if not cube.is_solved():
        return {
            "solvable": False,
            "method": "lbl",
            "totalMoves": 0,
            "stages": [],
            "error": "该魔方状态无法通过合法旋转还原（可能存在非法色块状态）",
        }

    total_moves = sum(len(sub.moves) for st in stages for sub in st.subSteps)
    return {
        "solvable": True,
        "method": "lbl",
        "totalMoves": total_moves,
        "stages": [
            {
                "id": st.id,
                "index": st.index,
                "title": st.title,
                "goal": st.goal,
                "idea": st.idea,
                "skipped": st.skipped,
                "subSteps": [
                    {
                        "tip": sub.tip,
                        "formulaName": sub.formulaName,
                        "formulaDesc": sub.formulaDesc,
                        "moves": sub.moves,
                    }
                    for sub in st.subSteps
                ],
            }
            for st in stages
        ],
    }
