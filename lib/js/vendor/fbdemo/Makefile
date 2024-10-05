# Copyright Pentrek Inc. 2022

# to fire up local server: python3 -m http.server

SRC = src/* content/*
PORTS = ports/*.cpp

ECMA = ecma/lerp.cpp ecma/jsc2d_canvas.cpp third_party/externals/harfbuzz/src/harfbuzz.cc

FLAGS = -O2 -DNDEBUG

INC = -I. -Ithird_party/externals/harfbuzz/src

EXP_METH = -sEXPORTED_RUNTIME_METHODS=UTF8ToString,stringToUTF8

lerp : $(ECMA)
	emcc $(FLAGS) $(EXP_METH) -lembind -o docs/lerp.mjs $(ECMA) $(INC) $(SRC) $(PORTS) --js-library ecma/lerp_lib.js --post-js ecma/lerp_post_lib.js
	cp ecma/mylerp.html docs/index.html
	cp ecma/pentrek_utils.mjs docs/

clean:
	@rm -rf docs/lerp.mjs docs/lerp.wasm

