from core.maze import Cell, Direction, Maze, generate
from core.sim import GameState, Outcome, cascade


def _line_maze():
    """3x1 maze: (0,0)->E->(1,0)->E->(2,0)=exit."""
    maze = Maze(width=3, height=1, start=(0, 0), exit=(2, 0))
    maze.cells[(0, 0)] = Cell(0, 0, Direction.EAST)
    maze.cells[(1, 0)] = Cell(1, 0, Direction.EAST)
    maze.cells[(2, 0)] = Cell(2, 0, Direction.EAST)  # arrow off-board, but exit
    return maze


def test_cascade_reaches_exit():
    res = cascade(_line_maze(), (0, 0))
    assert res.won
    assert res.path == [(0, 0), (1, 0), (2, 0)]


def test_cascade_off_board_is_stuck():
    maze = Maze(width=3, height=1, start=(0, 0), exit=(2, 0))
    maze.cells[(0, 0)] = Cell(0, 0, Direction.WEST)  # points off-board
    maze.cells[(1, 0)] = Cell(1, 0, Direction.EAST)
    maze.cells[(2, 0)] = Cell(2, 0, Direction.WEST)
    res = cascade(maze, (0, 0))
    assert res.outcome is Outcome.STUCK


def test_cascade_loop_is_stuck():
    maze = Maze(width=2, height=1, start=(0, 0), exit=(1, 0))
    maze.cells[(0, 0)] = Cell(0, 0, Direction.EAST)
    maze.cells[(1, 0)] = Cell(1, 0, Direction.WEST)  # back to (0,0): loop
    # exit is (1,0) which is entered before the loop closes -> actually a win
    maze.exit = (99, 99)  # move exit off so the loop is detectable
    res = cascade(maze, (0, 0))
    assert res.outcome is Outcome.STUCK


def test_gamestate_stepwise_matches_cascade():
    maze = _line_maze()
    state = GameState(maze)
    state.begin()
    assert state.reached == 1
    assert state.step() is Outcome.RUNNING
    assert state.step() is Outcome.WON
    assert state.active_path == cascade(_line_maze(), (0, 0)).path


def test_gamestate_run():
    state = GameState(_line_maze())
    state.begin()
    assert state.run() is Outcome.WON
    assert state.reached == 3


def test_gamestate_marks_active():
    maze = _line_maze()
    state = GameState(maze)
    state.begin()
    state.run()
    assert all(maze.cell(x, y).active for (x, y) in state.active_path)


def test_cascade_deterministic_over_generated():
    maze = generate(12, 12, seed=99)
    r1 = cascade(maze, maze.start)
    r2 = cascade(maze, maze.start)
    assert r1.path == r2.path and r1.outcome == r2.outcome
    assert r1.won  # generated mazes are solvable from start
