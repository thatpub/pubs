#!/bin/sh
if [ $1 ]
then
  FILES="$1"
else
  FILES=*_*.txt
fi
#echo $FILES
for txtin in $FILES
do
  mv $txtin sups/$txtin
done
