"""Synthese vocale edge-tts avec timings mot par mot.

Usage: python scripts/tts.py --text "..." --out chemin/base
Produit: <base>.mp3 et <base>.words.json ([{word, startMs, endMs}])
Les offsets edge-tts sont en ticks de 100 ns -> /10000 = millisecondes.
"""
import argparse
import asyncio
import json

import edge_tts


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", default="fr-FR-VivienneMultilingualNeural")
    parser.add_argument("--text", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    communicate = edge_tts.Communicate(args.text, args.voice, boundary="WordBoundary")
    words = []
    with open(args.out + ".mp3", "wb") as audio:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append(
                    {
                        "word": chunk["text"],
                        "startMs": round(chunk["offset"] / 10000),
                        "endMs": round((chunk["offset"] + chunk["duration"]) / 10000),
                    }
                )

    with open(args.out + ".words.json", "w", encoding="utf-8") as out:
        json.dump(words, out, ensure_ascii=False)


asyncio.run(main())
