"""Saved render dimensions; legacy snapshots retain the vertical default."""
def canvas(output_format='9:16'):
    return (1440, 1080) if output_format == '4:3' else (1080, 1920)
