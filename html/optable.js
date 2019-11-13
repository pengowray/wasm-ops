shorthand = {
	'clz':'iunop', 'ctz':'iunop', 'popcnt':'iunop',
	'abs':'funop', 'neg':'funop', 'sqrt':'funop', 'ceil':'funop', 'floor':'funop', 'nearest':'funop', /* 'trunc':'funop', (see exceptions) */ 
	'add':'binop', 'sub':'binop', 'mul':'binop', 'div':'binop', 'rem':'binop', 
	'and':'binop', 'or':'binop', 'xor':'binop', 'shl':'binop', 'shr':'binop', 'rotl':'binop', 'rotr':'binop', // ibinop
	'copysign':'binop', 'min':'binop', 'max':'binop', // fbinop: copysign | add | sub | mul | div | min | max | 
	'eq':'relop', 'ne':'relop', 'lt':'relop', 'gt':'relop', 'le':'relop', 'ge':'relop', // all exist for irelop & frelop
	'eqz':'testop',
	'wrap':'cvtop', 'extend':'cvtop', 'trunc':'cvtop', 'convert':'cvtop', 'demote':'cvtop', 'promote':'cvtop', 'reinterpret':'cvtop',
	'drop':'parametric', 'select':'parametric', 
	'get':'variable', 'set':'variable', 'tee':'variable', 
	'load':'memory', 'store':'memory', 'size':'memory', 'grow':'memory',
	'nop':'control', 'unreachable':'control', 'block':'control', 'loop':'control', 'if':'control', 'br':'control', 'br_if':'control', 'br_table':'control', 'return':'control', 'call':'control', 'call_indirect':'control', 'end':'control', 'else':'control',
	'const':'const'
}
// more trunc functions in 'cvtop' so make exceptions
shorthand_exceptions = { 
	'0x8F': 'funop', '0x9D':'funop'
}
function get_shorthand_group(op, hex) {
	if (hex in shorthand_exceptions) {
		return "group_sh_" + shorthand_exceptions[hex]
	}
	if (op in shorthand) {
		return "group_sh_" + shorthand[op];
	}
	return undefined;
}

function toHex(d) {
    return  ("0"+(Number(d).toString(16))).slice(-2).toUpperCase();
}


function ApplyFormatting() {
    var table = document.getElementById('opcodes');
    //for (var r = 0, n = table.rows.length; r < n; r++) {
		//for (var c = 0, m = table.rows[r].cells.length; c < m; c++) {
			//var cell = table.rows[r].cells[c];

	tds = table.getElementsByTagName("td");
	for (var n=0; n<tds.length;n++) {
		var cell = tds[n];

		var hex = "0x" + toHex(n); // e.g. 0x8F
		var op_hex = 'op_' + hex
		cell.classList.add(op_hex);

		var opcode = cell.innerHTML;
		var reserved = false;
		var proposal = "";
		if (opcode == "" || opcode[0] == "&" ) { //TODO: better selection of &npsb; aka \xa0
			cell.classList.add("reserved");
			reserved = true;
		} else if (opcode[0] == "*") {
			cell.classList.add("reserved");
			reserved = true;
			opcode = opcode.substring(1);
			proposal = opcode;
			cell.innerHTML = "<span>" + BoldMainOpBit(opcode) + "</span>";
		} else {
			cell.innerHTML = BoldMainOpBit(opcode);

			// classes for "groups" (excludes proposals for now)
			var chopped = ChopUp(opcode);
			var pre = undefined;
			var pre_group = undefined;
			if (typeof chopped.pre !== "undefined") {
				pre = chopped.pre.slice(0, -1);
				pre_group = 'group_pre_' + pre;
				cell.classList.add(pre_group);
			}
			if (typeof chopped.mainop !== "undefined") {
				//console.log(chopped.mainop);
				var op = "group_op_" + chopped.mainop;
				var colors = [];
				//hoverByClass(op, "lightblue"); // old

				if (chopped.mainop == "demote") op = "group_op_promote";
				cell.classList.add(op);
				
				var shortgroup = get_shorthand_group(chopped.mainop, hex);
				if (typeof shortgroup !== "undefined") {
					cell.classList.add(shortgroup);
					//colors.push({'classname':shortgroup, 'backgroundColor':'#EEE0FF'}); // was: #e8dcc1
					colors.push({'classname':shortgroup, 'highlight':'highlight-shorthand'});
				}
				

				//colors.push({'classname':op, 'backgroundColor':'lightblue'}) // #faf4c8
				colors.push({'classname':op, 'highlight':'highlight-opcode'})
				//colors.push({'classname':op_hex, 'color':'black', 'backgroundColor':'#24dff0'})
				colors.push({'classname':op_hex, 'highlight':'highlight-selection'})
				addHoverColor(cell, colors);

				if (typeof pre !== 'undefined') {
					var preElm = cell.getElementsByClassName('pre')[0]; //todo: check for null
					var preclass = 'pre_' + pre; // = 'group_pre_' + pre (to style the whole cell)
					addHoverColor(preElm, [{'classname':preclass, 'highlight':'highlight-pre'}]); // style text, e.g. "i32"
				}
				
			}
			if (typeof chopped.opbits !== "undefined") {
				cell.classList.add("group_opbits_" + chopped.opbits); 
			}
			if (typeof chopped.post !== "undefined") {
				cell.classList.add("group_post" + chopped.post); 
			}
			if (typeof chopped.sign !== "undefined") {
				cell.classList.add("group_sign" + chopped.sign); 
			}
		}

		var opcodeText = opcode;
		var proposedText = "";

		var help = document.getElementById(hex);
		var helpText = "";
		var immediateArg = "";
		if (help != null) {
			// remove <span class="immediate-args">x</span> so it can be placed beside the op code.
			var immediateArgElm = help.getElementsByClassName("immediate-args");
			if (typeof immediateArgElm[0] !== "undefined") {
				var iaElm = immediateArgElm[0];
				immediateArg = " " + iaElm.outerHTML;
				iaElm.parentNode.removeChild(iaElm);
			}

			helpText = help.innerHTML;
		}


		if (reserved) { 
			opcodeText = "<em>Reserved</em>";
			if (proposal) {
				proposedText = "<p>Proposed: " + proposal + immediateArg + "</p>";
			}
		}
		var tooltiptext = "<div><div class='hex'>" + hex + "</div><h3>" + opcodeText + immediateArg + "</h3>" + proposedText + helpText + "</div>";
		tippy(cell, {
			content: tooltiptext, 
			delay: [100, 0], 
			theme: 'light-border', //TODO
			//interactive: true, // TODO (causes unstable table display)
			placement: 'bottom',});
	}
	OnceLoaded();
}

function addHoverColor(cell, classesToColor) { // classesToColor = [{'classname':'class','highlight':'highlight-class'},...]
	cell.onmouseover = function() {
		for (var i=0;i<classesToColor.length;i++) {
			var item = classesToColor[i];
			var elms=document.getElementsByClassName(item.classname);
			for(var k=0;k<elms.length;k++) {
				elms[k].classList.add(item.highlight);
			}
		}
	};
	cell.onmouseout = function(){
		for (var i=0;i<classesToColor.length;i++) {
			var item = classesToColor[i];
			var elms=document.getElementsByClassName(item.classname);
			for(var k=0;k<elms.length;k++) {
				elms[k].classList.remove(item.highlight);
			}
		}
	};	
}

function OnceLoaded() {
}

// pre: (i32|i64|f32|f64|table|memory|data|elem)
// mainop: select, trunc, eqz, load
// mainopbits: 8 (load8)
// post: f32 (f64.​promote​_f32)
// sign: [su] (i32.​div​_s, i64.trunc_sat_f32_s)
//var opcodeRegex = /(?<pre>[a-z0-9]+(?:\.))?(?<mainop>[a-z_]+)(?<post>(?:_)(i32|i64|f32|f64))?(?<sign>(?:_)[su])?/;
//var opcodeRegex = /(?<pre>[a-z0-9]+\.)?(?<mainop>[a-z_]+)(?<post>(?:_)(i32|i64|f32|f64))?(?<sign>(?:_)[su])?/;
//var opcodeRegex = /(?<pre>[a-z0-9]+\.)?(?<mainop>(([a-z]+|_(?!([[iu][0-9])))+))(?<post>(?:_)(i32|i64|f32|f64))?(?<sign>(?:_)[su])?/;
const opcodeRegex = XRegExp(
	`(?<pre>    [a-z0-9]+\\.)?                       # before the dot: 'f64.' 'table.' 'memory.' (optional)
	 (?<mainop> (([a-z]+|_(?!([su]$|[if][36])))+))   # e.g: nop, br_table, wrap [not wrap_i64], load [not load8], convert, ...
	 (?<opbits> [0-9]+)?                             # e.g. '8' (from load8) optional
	 (?<post>   (?:_)(i32|i64|f32|f64))?             # optional
	 (?<sign>   (?:_)[su])?	                         # optional`
		, 'x');

function ChopUp(opcodeName) {
	var matches = XRegExp.exec(opcodeName, opcodeRegex);
	return matches;
}

function BoldMainOpBit(opcodeName) {
	// todo: replace with some neater regex maybe, eg ChopUp()
	// todo: insert zws's in separate method (and include in copy-sign + pop-cnt)
	var zws = "<wbr>"; // "&#8203;"; // zero-width space. "<zws>" doesn't appear in clipboard (yay)
	if (opcodeName.includes(".")) {
		// bold after the dot
		split = opcodeName.split(".");
		if (split[1].includes("_") && split[1] != "is_null") {
			// don't bold after the first underscore (for all opcodes containing a dot, except for "is_null")
			secondSplit = split[1].split("_");
			return "<span class='pre pre_" + split[0] + "''>" + split[0] + "</span>.<span class='op'>" + secondSplit[0] + "</span><span class='post'>_" + secondSplit.slice(1).join("_") + "</span>";
		} else {
			return "<span class='pre pre_" + split[0] + "'>" + split[0] + "</span>.<span class='op'>" + split[1] + "</span>";
		}
	} else {
		return "<span class='op'>" + opcodeName + "</span>";
	}
	//return opcodeName;
}

onload = ApplyFormatting;