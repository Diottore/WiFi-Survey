"""
Database initialization and session management.
"""
import os
from sqlmodel import SQLModel, create_engine, Session
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

# Database URL - use environment variable or default to local SQLite
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./db.sqlite")

# Create engine with check_same_thread=False for SQLite
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def init_db():
    """Initialize database tables"""
    logger.info("Initializing database...")
    SQLModel.metadata.create_all(engine)
    logger.info("Database initialized successfully")


@contextmanager
def get_session():
    """Get database session context manager"""
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db_session():
    """Get database session for dependency injection"""
    with Session(engine) as session:
        yield session
