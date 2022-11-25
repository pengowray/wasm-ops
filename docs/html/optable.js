/*
shorthand = {
	'clz':'iunop', 'ctz':'iunop', 'popcnt':'iunop',
	'abs':'funop', 'neg':'funop', 'sqrt':'funop', 'ceil':'funop', 'floor':'funop', 'nearest':'funop', // 'trunc':'funop', (see exceptions) 
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
/shorthand_exceptions = { 
	'0x8F': 'funop', '0x9D':'funop'
}
*/

// disable "shorthand" (highlight groups) until can be reworked with new op codes
shorthand = {}
shorthand_exceptions = {}

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

function isNull(v) {
	return (v === undefined) || v === null; 
}

function isNullOrEmpty(v) {
	return (v === undefined) || v === null || (typeof v == "string" && v.trim() === "");
}

function ApplyFormattingAll() {
	ApplyFormatting(document.getElementById('opcodes'), '');
 	ApplyFormatting(document.getElementById('opcodes_FB'), 'FB');
	ApplyFormatting(document.getElementById('opcodes_FC'), 'FC');
	ApplyFormatting(document.getElementById('opcodes_FD'), 'FD');
	ApplyFormatting(document.getElementById('opcodes_FE'), 'FE');
}

function ApplyFormatting(table, prefix) {
    //for (var r = 0, n = table.rows.length; r < n; r++) {
		//for (var c = 0, m = table.rows[r].cells.length; c < m; c++) {
			//var cell = table.rows[r].cells[c];

	tds = table.getElementsByTagName("td");
	for (var n=0; n<tds.length;n++) {
		var cell = tds[n];

		var hex = "0x" + prefix + toHex(n); // e.g. '0x8F' or '0xFD23'
		var op_hex = 'op_' + hex
		cell.classList.add(op_hex);

		// take opcode from "opcode" attribute if available, but usually it's from the cell text
		var opcode = cell.getAttribute("opcode");
		var opcodeFromAttrib = true;
		if (isNullOrEmpty(opcode)) {
			opcode = cell.innerText;
			opcodeFromAttrib = false;
		}
		var helpOpcodeTitle = cell.getAttribute("displayOpcode");
		if (isNull(helpOpcodeTitle)) {
			helpOpcodeTitle = opcode;
		}
		
		var reserved = false;
		var proposal = "";
		if (isNullOrEmpty(opcode) || opcode[0] == "&" ) { //TODO: better selection of &npsb; aka \xa0
			cell.classList.add("reserved");
			reserved = true;
		} else if (opcode[0] == "*") {
			cell.classList.add("reserved");
			reserved = true;
			opcode = opcode.substring(1);
			proposal = opcode;
			cell.innerHTML = "<span>" + BoldMainOpBit(opcode) + "</span>";
		} else {
			if (opcodeFromAttrib) {
				cell.innerHTML = BoldMainOpBit(cell.innerHTML);
			} else {
				cell.innerHTML = BoldMainOpBit(opcode);
			}

			// classes for "groups" (excludes proposals for now)
			var chopped = ChopUp(opcode);
			var pre = undefined;
			var pre_group = undefined;
			if (chopped !== null && !isNull(chopped.pre)) {
				pre = chopped.pre.slice(0, -1);
				pre_group = 'group_pre_' + pre;
				cell.classList.add(pre_group);
			}
			if (chopped !== null && !isNull(chopped.mainop)) {
				var op = "group_op_" + chopped.mainop;
				var colors = [];
				//hoverByClass(op, "lightblue"); // old

				// treat demote and promote as the "same" so they're highlighted together (as there's so few of these op codes)
				if (chopped.mainop == "demote") op = "group_op_promote"; 
				cell.classList.add(op);
				
				var shortgroup = get_shorthand_group(chopped.mainop, hex);
				if (shortgroup !== null && !isNullOrEmpty(shortgroup)) {
					cell.classList.add(shortgroup);
					//colors.push({'classname':shortgroup, 'backgroundColor':'#EEE0FF'}); // was: #e8dcc1
					colors.push({'classname':shortgroup, 'highlight':'highlight-shorthand'});
				}

				//colors.push({'classname':op, 'backgroundColor':'lightblue'}) // #faf4c8
				colors.push({'classname':op, 'highlight':'highlight-opcode'})
				//colors.push({'classname':op_hex, 'color':'black', 'backgroundColor':'#24dff0'})
				colors.push({'classname':op_hex, 'highlight':'highlight-selection'})
				addHoverColor(cell, colors);

				if (chopped !== null && !isNull(pre)) {
					var preElm = cell.getElementsByClassName('pre')[0]; //todo: check for null
					var preclass = 'pre_' + pre; // = 'group_pre_' + pre (to style the whole cell)
					addHoverColor(preElm, [{'classname':preclass, 'highlight':'highlight-pre'}]); // style text, e.g. "i32"
				}
				
			}
			if (chopped !== null && !isNull(chopped.opbits)) {
				cell.classList.add("group_opbits_" + chopped.opbits); 
			}
			if (chopped !== null && !isNull(chopped.post)) {
				cell.classList.add("group_post" + chopped.post); 
			}
			if (chopped !== null && !isNull(chopped.sign)) {
				cell.classList.add("group_sign" + chopped.sign); 
			}
		}

		//var opcodeText = opcode;
		var opcodeText = helpOpcodeTitle
		var proposedText = "";

		var help = document.getElementById(hex);
		var helpText = "";
		var immediateArg = "";
		if (help != null) {
			// remove <span class="immediate-args">x</span> so it can be placed beside the op code.
			var immediateArgElm = help.getElementsByClassName("immediate-args");
			if (immediateArgElm !== null && immediateArgElm.length >= 1 && !isNull(immediateArgElm[0])) {
				var iaElm = immediateArgElm[0];
				immediateArg = " " + iaElm.outerHTML;
				iaElm.parentNode.removeChild(iaElm);
			}

			helpText = help.innerHTML;
		}


		// a little text if there's no helptext yet
		if (reserved && helpText == "") {
			if (proposal) {
				helpText = "<p><i>Proposal</i></p>";
			} else  {
				opcodeText = "<em>Reserved</em>";
			}
		}
		
		var tooltiptext = "<div><div class='hex'>" + hex + "</div><h3>" + opcodeText + immediateArg + "</h3>" + helpText + "</div>";
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
	`(?<pre>    [a-z0-9]+\\.(atomic\.)?(rmw[0-9]*\.)?)            # before the dot: 'f64.' 'table.' 'memory.'  'i32.atomic.rmw16' (optional)
	 (?<mainop> [a-z]+)   # e.g: nop, br_table, wrap [not wrap_i64], load [not load8], convert, q15mulr (todo)...
	 (?<opbits> [0-9]+)?                             # e.g. '8' (from load8) optional
	 (?<post>   (?:_)((low|high|sat)_[ixf0-9]+|i32|i64|f32|f64|pairwise|lane))?             # optional
	 (?<sign>   (?:_)[su])?	                         # optional
	 (?<rest>   ([0-9a-zA-Z\._]))?`
		, 'x');

function ChopUp(opcodeName) {
	var matches = XRegExp.exec(opcodeName, opcodeRegex);
	// example: Array(10) [ "i32.load16_u", "i32.", "load", "load", "load", undefined, "16", undefined, undefined, "_u" ]
	// example: groups: Object { pre: "i32.", mainop: "load", opbits: "16", post: undefined,  pre: "i32.", sign: "_u" }
	
	if (matches !== null && matches.groups !== undefined) {
		console.log(matches.groups);
		return matches.groups;
	}
	
	return null;
}

function BoldMainOpBit(opcodeName) {
	// todo: replace with some neater regex maybe, eg ChopUp()
	// todo: insert zws's in separate method (and include in copy-sign + pop-cnt)
	var zws = "<wbr>"; // "&#8203;"; // zero-width space. "<zws>" doesn't appear in clipboard (yay)
	if (opcodeName.includes(".")) {
		// bold after the dot
		split = opcodeName.split(".");
		if (split[1] == "atomic") {
			if (split[2][0] == 'r') { // if (split[2].startsWith('rwm'))
				split[0] += ".atomic." + split[2]; // eg 'i32.atomic.rmw16'
				split[1] = split[3];
			} else {
				split[0] += ".atomic"  // eg 'i32.atomic' from 'i32.atomic.store'
				split[1] = split[2];
			}
		}
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

onload = ApplyFormattingAll;