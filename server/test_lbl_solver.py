import random
import unittest

from lbl_solver import SOLVED_FACELETS, CubeState, solve_lbl


class TestLblSolver(unittest.TestCase):
    def test_base_moves_match_singmaster_standard(self):
        c = CubeState()
        c.apply_move("R")
        self.assertEqual(
            c.to_string(),
            "UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB",
        )

        c = CubeState()
        c.apply_move("U")
        self.assertEqual(
            c.to_string(),
            "UUUUUUUUUBBBRRRRRRRRRFFFFFFDDDDDDDDDFFFLLLLLLLLLBBBBBB",
        )

        c = CubeState()
        c.apply_move("F")
        self.assertEqual(
            c.to_string(),
            "UUUUUULLLURRURRURRFFFFFFFFFRRRDDDDDDLLDLLDLLDBBBBBBBBB",
        )

    def test_already_solved_cube(self):
        res = solve_lbl(SOLVED_FACELETS)
        self.assertTrue(res["solvable"])
        self.assertEqual(res["totalMoves"], 0)
        self.assertEqual(len(res["stages"]), 7)
        self.assertTrue(all(st["skipped"] for st in res["stages"]))

    def test_solves_200_random_scrambles_cleanly(self):
        rng = random.Random(20261123)
        all_moves = [
            f"{face}{suf}"
            for face in ("U", "D", "R", "L", "F", "B")
            for suf in ("", "'", "2")
        ]

        for trial in range(200):
            cube = CubeState()
            scramble = [rng.choice(all_moves) for _ in range(25)]
            cube.apply_moves(scramble)
            start_state = cube.to_string()

            res = solve_lbl(start_state)
            self.assertTrue(
                res["solvable"],
                f"Trial {trial} failed to solve scramble {scramble}: {res.get('error')}",
            )
            self.assertEqual(len(res["stages"]), 7)

            # Replay every returned move on a fresh CubeState and verify exact solved state
            verify = CubeState(start_state)
            replayed_count = 0
            for stage in res["stages"]:
                for sub in stage["subSteps"]:
                    verify.apply_moves(sub["moves"])
                    replayed_count += len(sub["moves"])

            self.assertEqual(replayed_count, res["totalMoves"])
            self.assertTrue(
                verify.is_solved(),
                f"Trial {trial} replay did not reach solved state! Scramble: {scramble}",
            )


if __name__ == "__main__":
    unittest.main()
