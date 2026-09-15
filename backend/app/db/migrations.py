"""Additive, idempotent SQLite upgrades for existing local libraries."""
from sqlalchemy import Engine, inspect, text


def upgrade_local_database(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as connection:
        # Serialize startup upgrades when multiple local workers start together.
        connection.exec_driver_sql("BEGIN IMMEDIATE")
        project_columns = {column["name"] for column in inspect(connection).get_columns("projects")}
        if "artist" not in project_columns:
            connection.exec_driver_sql("ALTER TABLE projects ADD COLUMN artist VARCHAR(200) NOT NULL DEFAULT ''")
        for name, definition in {
            "owner_id": "INTEGER REFERENCES users(id)",
            "cover_path": "VARCHAR(255)", "notes": "TEXT NOT NULL DEFAULT ''",
            "share_token": "VARCHAR(100)", "sharing_enabled": "BOOLEAN NOT NULL DEFAULT 0",
            "allow_downloads": "BOOLEAN NOT NULL DEFAULT 0",
        }.items():
            if name not in project_columns:
                connection.exec_driver_sql(f"ALTER TABLE projects ADD COLUMN {name} {definition}")
        connection.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_projects_share_token ON projects (share_token)")
        connection.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_projects_owner_id ON projects (owner_id)")
        song_columns = {column["name"] for column in inspect(connection).get_columns("songs")}
        if "position" not in song_columns:
            connection.exec_driver_sql("ALTER TABLE songs ADD COLUMN position INTEGER NOT NULL DEFAULT 1")
            # Preserve the old newest-first display order on the first upgrade.
            rows = connection.execute(text("SELECT id, project_id FROM songs ORDER BY project_id, id DESC"))
            counters: dict[int, int] = {}
            for song_id, project_id in rows.fetchall():
                counters[project_id] = counters.get(project_id, 0) + 1
                connection.execute(text("UPDATE songs SET position=:position WHERE id=:id"),
                                   {"position": counters[project_id], "id": song_id})
