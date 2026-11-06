from core.maze import generate
from core.sim import GameState
from core.rules import has_won, is_stuck, solves, valid_start


def test_valid_start_bounds():
    maze = generate(5, 5, seed=3)
    assert valid_start(maze, (0, 0))
    assert not valid_start(maze, (-1, 0))
    assert not valid_start(maze, (5, 5))


def test_solves_from_start():
    maze = generate(8, 8, seed=4)
    assert solves(maze, maze.start)


def test_has_won_and_stuck():
    maze = generate(8, 8, seed=5)
    state = GameState(maze)
    state.begin()
    state.run()
    assert has_won(state)
    assert not is_stuck(state)
