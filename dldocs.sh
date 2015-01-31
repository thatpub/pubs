#!/bin/sh
wget -i $1 -nc -nd -nv --retry-connrefused -t 3
