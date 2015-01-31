#!/bin/bash
if [ $1 ]
then
  FILES="$1"
else
  FILES=pdf/*.pdf
fi
#echo $FILES
for pdfin in $FILES
do
  txtout="txt/${pdfin:4:(-4)}.txt"
#  echo $txtout
#  echo $pdfin
  pdftotext -eol unix -enc UTF-8 -nopgbrk -layout $pdfin $txtout
done


