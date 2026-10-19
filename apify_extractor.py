"""
Apify Scraper Integration for Pick-a-Recipe / YemekApp.
Fetches video details, captions, transcripts, and clean media URLs
for TikTok, Instagram, YouTube and other platforms via Apify Actors.
"""

import os
import re
import requests
from typing import Optional, Dict, Any
from helpers import setup_logger
from config import config

logger = setup_logger(__name__)

APIFY_API_BASE = "https://api.apify.com/v2"

def is_apify_available() -> bool:
    """Check if Apify is enabled and has a valid API token."""
    token = config.APIFY_API_TOKEN.strip()
    return bool(token and config.APIFY_ENABLED)

def extract_with_apify(url: str) -> Optional[Dict[str, Any]]:
    """
    Extract video metadata, caption/transcript, and media URL using Apify.
    Returns a dict with:
      - title: str
      - description: str
      - transcript: str
      - video_url: str (clean mp4 if available)
      - thumbnail_url: str
      - raw_data: dict
    or None if extraction was not possible or failed.
    """
    token = config.APIFY_API_TOKEN.strip()
    if not token:
        logger.debug("[Apify] No API token configured, skipping Apify extraction.")
        return None

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    clean_url = url.strip()
    logger.info(f"[Apify] Attempting extraction for: {clean_url}")

    try:
        # Determine platform
        if "tiktok.com" in clean_url:
            return _scrape_tiktok(clean_url, headers)
        elif "instagram.com" in clean_url:
            return _scrape_instagram(clean_url, headers)
        elif "youtube.com" in clean_url or "youtu.be" in clean_url:
            return _scrape_youtube(clean_url, headers)
        else:
            return _scrape_generic(clean_url, headers)
    except Exception as exc:
        logger.warning(f"[Apify] Extraction failed with exception: {exc}")
        return None

def _run_actor_sync(actor_id: str, run_input: dict, headers: dict) -> list:
    """Run an Apify actor synchronously and fetch dataset items."""
    # Run sync endpoint runs the actor and returns the dataset directly
    url = f"{APIFY_API_BASE}/acts/{actor_id}/run-sync-get-dataset-items"
    resp = requests.post(url, json=run_input, headers=headers, timeout=60)
    if resp.status_code in (200, 201):
        data = resp.json()
        if isinstance(data, list):
            return data
        elif isinstance(data, dict) and "items" in data:
            return data["items"]
    logger.warning(f"[Apify] Actor {actor_id} returned status {resp.status_code}: {resp.text[:200]}")
    return []

def _scrape_tiktok(url: str, headers: dict) -> Optional[Dict[str, Any]]:
    """Scrape TikTok video details using clockworks/free-tiktok-scraper or apify/tiktok-scraper."""
    logger.info("[Apify] Running TikTok scraper...")
    run_input = {
        "postURLs": [url],
        "commentsPerPost": 0,
        "maxItems": 1
    }
    # Try clockworks/free-tiktok-scraper first
    items = _run_actor_sync("clockworks~free-tiktok-scraper", run_input, headers)
    if not items:
        # Fallback to general tiktok scraper
        items = _run_actor_sync("apify~tiktok-scraper", run_input, headers)

    if not items:
        return None

    item = items[0]
    desc = item.get("text") or item.get("desc") or item.get("title") or ""
    video_url = (
        item.get("videoUrl") or
        item.get("mediaUrls", [None])[0] or
        item.get("video", {}).get("downloadAddr") or
        ""
    )
    thumbnail = (
        item.get("covers", [None])[0] or
        item.get("video", {}).get("cover") or
        item.get("thumbnail") or
        ""
    )
    
    # Try to grab subtitles/captions if present
    subtitles = []
    if "subtitles" in item and isinstance(item["subtitles"], list):
        for sub in item["subtitles"]:
            if isinstance(sub, dict) and sub.get("text"):
                subtitles.append(sub["text"])
    transcript = " ".join(subtitles)

    return {
        "title": desc[:80] or "TikTok Yemek Tarifi",
        "description": desc,
        "transcript": transcript,
        "video_url": video_url,
        "thumbnail_url": thumbnail,
        "platform": "tiktok",
        "raw_data": item
    }

def _scrape_instagram(url: str, headers: dict) -> Optional[Dict[str, Any]]:
    """Scrape Instagram reel/post using apify/instagram-reel-scraper or apify/instagram-scraper."""
    logger.info("[Apify] Running Instagram scraper...")
    run_input = {
        "directUrls": [url],
        "resultsType": "posts",
        "resultsLimit": 1
    }
    items = _run_actor_sync("apify~instagram-scraper", run_input, headers)
    if not items:
        return None

    item = items[0]
    caption = item.get("caption") or item.get("text") or ""
    video_url = item.get("videoUrl") or item.get("video_url") or ""
    thumbnail = item.get("displayUrl") or item.get("thumbnailUrl") or ""

    return {
        "title": caption[:80] or "Instagram Yemek Tarifi",
        "description": caption,
        "transcript": "",
        "video_url": video_url,
        "thumbnail_url": thumbnail,
        "platform": "instagram",
        "raw_data": item
    }

def _scrape_youtube(url: str, headers: dict) -> Optional[Dict[str, Any]]:
    """Scrape YouTube video and captions using streamers/youtube-scraper."""
    logger.info("[Apify] Running YouTube scraper...")
    run_input = {
        "startUrls": [{"url": url}],
        "maxResults": 1,
        "subtitlesLanguage": "tr,en",
        "downloadSubtitles": True
    }
    items = _run_actor_sync("streamers~youtube-scraper", run_input, headers)
    if not items:
        return None

    item = items[0]
    title = item.get("title") or "YouTube Yemek Tarifi"
    desc = item.get("description") or ""
    subtitles = item.get("subtitlesText") or item.get("subtitles") or ""
    thumbnail = item.get("thumbnailUrl") or ""

    return {
        "title": title,
        "description": desc,
        "transcript": str(subtitles) if subtitles else "",
        "video_url": url,
        "thumbnail_url": thumbnail,
        "platform": "youtube",
        "raw_data": item
    }

def _scrape_generic(url: str, headers: dict) -> Optional[Dict[str, Any]]:
    """Fallback generic scraper."""
    return None
