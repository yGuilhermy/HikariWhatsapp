import os
import sys
from pathlib import Path
from shutil import copyfile

from deezer import Deezer
from deemix import generateDownloadObject
from deemix.downloader import Downloader
from deemix.settings import load as loadSettings
from deemix.utils.localpaths import getConfigFolder


def download(url, output_folder):
    session = Deezer()
    arl = os.environ.get("DEEZER_ARL")
    if arl and not session.login_via_arl(arl):
        sys.exit("DEEZER_AUTH_REQUIRED")

    output_folder = Path(output_folder).resolve()
    local_settings = Path(getConfigFolder()) / 'config.json'
    if local_settings.is_file():
        copyfile(local_settings, output_folder / 'config.json')
    settings = loadSettings(output_folder)
    settings["downloadLocation"] = str(output_folder)
    settings["createSingleFolder"] = False
    settings["createAlbumFolder"] = False
    settings["maxBitrateFallback"] = True
    settings["executeCommand"] = ""
    settings["logSearched"] = False
    settings["logErrors"] = False

    final_audio = None
    for bitrate in (3, 1):
        job = generateDownloadObject(session, url, bitrate)
        Downloader(session, job, settings).start()
        generated = tuple(
            file for file in output_folder.rglob("*")
            if file.is_file() and not file.is_symlink()
            and file.suffix.lower() in (".mp3", ".flac") and file.stat().st_size > 0
        )
        if not job.failed and generated:
            final_audio = max(generated, key=lambda file: file.stat().st_mtime)
            break
        for file in generated:
            file.unlink(missing_ok=True)

    if final_audio is None:
        sys.exit("DEEZER_NO_AUDIO")

    published = output_folder / ("track" + final_audio.suffix.lower())
    final_audio.replace(published)
    for file in output_folder.iterdir():
        if file.is_file() and file != published and file.suffix.lower() in (".mp3", ".flac"):
            file.unlink(missing_ok=True)
    print(f"DOWNLOADED_FILE:{published}")


if __name__ == "__main__":
    download(sys.argv[1], sys.argv[2])
