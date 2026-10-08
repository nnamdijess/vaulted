import tempfile
import unittest
from pathlib import Path

from sqlalchemy import create_engine, text

from app.db.migrations import upgrade_local_database


class MigrationTest(unittest.TestCase):
    def test_preserves_legacy_records_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = create_engine(f"sqlite:///{Path(directory, 'legacy.db').as_posix()}")
            with engine.begin() as connection:
                connection.exec_driver_sql("CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, description TEXT, created_at TEXT)")
                connection.exec_driver_sql("CREATE TABLE songs (id INTEGER PRIMARY KEY, project_id INTEGER, title TEXT, artist TEXT, bpm REAL, key TEXT, status TEXT, notes TEXT, created_at TEXT)")
                connection.exec_driver_sql("CREATE TABLE song_versions (id INTEGER PRIMARY KEY, song_id INTEGER, version_name TEXT, file_path TEXT, original_filename TEXT, notes TEXT, created_at TEXT)")
                connection.exec_driver_sql("INSERT INTO projects VALUES (1, 'Existing project', 'Keep description', '2026-01-01')")
                connection.exec_driver_sql("INSERT INTO songs VALUES (1, 1, 'First', 'Artist', 120, 'C', 'demo', 'Keep notes', '2026-01-01'), (2, 1, 'Second', '', NULL, '', 'demo', '', '2026-01-02')")
                connection.exec_driver_sql("INSERT INTO song_versions VALUES (1, 1, 'v1', 'existing.wav', 'demo.wav', 'Version notes', '2026-01-01')")
                connection.exec_driver_sql("CREATE TABLE content_projects (id INTEGER PRIMARY KEY, title TEXT)")
                connection.exec_driver_sql("INSERT INTO content_projects VALUES (1, 'Existing Studio draft')")
            upgrade_local_database(engine)
            upgrade_local_database(engine)
            with engine.connect() as connection:
                self.assertEqual(connection.execute(text("SELECT title, text_style FROM content_projects")).one(), ('Existing Studio draft', '{}'))
                self.assertEqual(connection.execute(text("SELECT cover_path, notes, share_token, sharing_enabled, allow_downloads FROM projects")).one(), (None, '', None, 0, 0))
                self.assertEqual(connection.execute(text("SELECT id, position FROM songs ORDER BY position")).all(), [(2, 1), (1, 2)])
                self.assertEqual(connection.execute(text("SELECT title, artist, bpm, notes FROM songs WHERE id=1")).one(), ('First', 'Artist', 120, 'Keep notes'))
                self.assertEqual(connection.execute(text("SELECT song_id, file_path, notes FROM song_versions")).one(), (1, 'existing.wav', 'Version notes'))
                self.assertEqual(connection.execute(text("SELECT name, description, artist FROM projects")).one(), ('Existing project', 'Keep description', ''))
            engine.dispose()


if __name__ == '__main__':
    unittest.main()
