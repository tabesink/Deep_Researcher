import os
from dataclasses import dataclass, fields
from typing import Any, Optional

from langchain_core.runnables import RunnableConfig
from dotenv import load_dotenv

from enum import Enum
load_dotenv()
class SearchAPI(Enum):
    PERPLEXITY = "perplexity"
    TAVILY = "tavily"
    DUCKDUCKGO = "duckduckgo"
    DOCUMENT_SEARCH = "document_search"

@dataclass(kw_only=True)
class Configuration:
    """The configurable fields for the research assistant."""
    #max_web_research_loops: int = int(os.environ.get("MAX_WEB_RESEARCH_LOOPS", "3"))
    max_research_loops: int = int(os.environ.get("MAX_RESEARCH_LOOPS", "0"))
    openai_model: str = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    openai_embedding_model: str = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-ada-002")
    search_api: SearchAPI = SearchAPI(os.environ.get("SEARCH_API", SearchAPI.DOCUMENT_SEARCH.value))  # Default to DUCKDUCKGO
    fetch_full_page: bool = os.environ.get("FETCH_FULL_PAGE", "False").lower() in ("true", "1", "t")
    openai_base_url: str = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
    openai_api_key: str = os.environ.get("OPENAI_API_KEY")
    

    @classmethod
    def from_runnable_config(
        cls, config: Optional[RunnableConfig] = None
    ) -> "Configuration":
        """Create a Configuration instance from a RunnableConfig."""
        configurable = (
            config["configurable"] if config and "configurable" in config else {}
        )
        values: dict[str, Any] = {
            f.name: os.environ.get(f.name.upper(), configurable.get(f.name))
            for f in fields(cls)
            if f.init
        }
        return cls(**{k: v for k, v in values.items() if v})

    def clear_api_key(self) -> None:
        """Clear the OpenAI API key from environment variables and this instance."""
        if "OPENAI_API_KEY" in os.environ:
            del os.environ["OPENAI_API_KEY"]
        self.openai_api_key = None