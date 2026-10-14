"""Format the virtual printer output as an 80 mm receipt without altering its content."""
import os
import sys
import pdfplumber
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject

file_path = sys.argv[1]
reader = PdfReader(file_path)
writer = PdfWriter()
with pdfplumber.open(file_path) as measured:
    for page, layout in zip(reader.pages, measured.pages):
        bottom = max((char['bottom'] for char in layout.chars), default=100) + 12
        height = float(page.mediabox.height)
        width = min(80 * 72 / 25.4, float(page.mediabox.width))
        box = RectangleObject([0, max(0, height - bottom), width, height])
        page.mediabox = box
        page.cropbox = box
        writer.add_page(page)
temp_path = file_path + '.receipt.tmp'
with open(temp_path, 'wb') as output:
    writer.write(output)
os.replace(temp_path, file_path)
