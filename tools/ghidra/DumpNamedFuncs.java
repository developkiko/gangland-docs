// Выгружает все функции программы: имя @ адрес (только именованные — с символами).
//@category Analysis

import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;

import java.io.PrintWriter;
import java.io.FileWriter;

public class DumpNamedFuncs extends GhidraScript {

    public void run() throws Exception {
        PrintWriter out = new PrintWriter(new FileWriter("C:\\Meine\\gangland-online\\info\\functions.txt"));
        int total = 0, named = 0;
        FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
        while (it.hasNext()) {
            Function f = it.next();
            total++;
            String name = f.getName();
            if (!name.startsWith("FUN_") && !name.startsWith(" thunk")) {
                out.println(f.getEntryPoint() + " " + name);
                named++;
            }
        }
        out.close();
        println("всего функций: " + total + ", именованных: " + named);
    }
}
