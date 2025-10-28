"""Database initialization and session management."""
from sqlmodel import create_engine, SQLModel, Session
from pathlib import Path

# Database file path
DB_DIR = Path(__file__).parent.parent
DB_FILE = DB_DIR / "db.sqlite"

# Create engine
engine = create_engine(f"sqlite:///{DB_FILE}", echo=False)


def init_db():
    """Initialize database tables."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Get database session."""
    with Session(engine) as session:
        yield session
