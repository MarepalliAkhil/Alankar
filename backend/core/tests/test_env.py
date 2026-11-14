"""Environment values are read without the stray spaces cmd.exe keeps ("set X=y && ...")."""

from core.env import env


def test_env_strips_the_space_cmd_exe_leaves_before_and(monkeypatch):
    monkeypatch.setenv("SALON_TEST_VALUE", "salon_demo ")
    assert env("SALON_TEST_VALUE") == "salon_demo"


def test_a_value_of_only_spaces_counts_as_missing(monkeypatch):
    monkeypatch.setenv("SALON_TEST_VALUE", "   ")
    assert env("SALON_TEST_VALUE", "fallback") == "fallback"
