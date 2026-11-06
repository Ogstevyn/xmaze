from core.maze import Cell, Direction, Maze, generate, is_solvable


def test_direction_delta_and_opposite():
    assert Direction.NORTH.dx == 0 and Direction.NORTH.dy == -1
    assert Direction.SOUTH.opposite is Direction.NORTH
    assert Direction.EAST.opposite is Direction.WEST


def test_cell_target():
    c = Cell(2, 3, Direction.EAST)
    assert c.target() == (3, 3)


def test_generate_is_solvable():
    for seed in range(50):
        maze = generate(8, 8, seed=seed)
        assert is_solvable(maze), f"seed {seed} unsolvable"


def test_generate_deterministic():
    a = generate(10, 10, seed=42)
    b = generate(10, 10, seed=42)
    assert a.to_dict() == b.to_dict()


def test_generate_different_seeds_differ():
    a = generate(10, 10, seed=1)
    b = generate(10, 10, seed=2)
    assert a.to_dict() != b.to_dict()


def test_start_and_exit_corners():
    maze = generate(6, 5, seed=7)
    assert maze.start == (0, 0)
    assert maze.exit == (5, 4)


def test_roundtrip_serialisation():
    maze = generate(9, 7, seed=11)
    restored = Maze.from_dict(maze.to_dict())
    assert restored.to_dict() == maze.to_dict()
    assert is_solvable(restored)


def test_reject_tiny_maze():
    try:
        generate(1, 1, seed=0)
    except ValueError:
        return
    raise AssertionError("expected ValueError for 1x1 maze")
