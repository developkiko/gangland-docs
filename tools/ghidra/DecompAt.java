// Ghidra headless: декомпилировать функции по адресам, переданным аргументами скрипта.
//@category Analysis

import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

import java.io.PrintWriter;
import java.io.FileWriter;

public class DecompAt extends GhidraScript {

    private static final String OUT = "C:\\Meine\\tools\\dec_at.c";

    public void run() throws Exception {
        String[] args = getScriptArgs();
        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        PrintWriter out = new PrintWriter(new FileWriter(OUT, true));
        for (String arg : args) {
            Address a = currentProgram.getAddressFactory().getAddress(arg);
            Function f = getFunctionContaining(a);
            if (f == null) {
                out.println("// ==== НЕТ ФУНКЦИИ для " + arg + " ====");
                continue;
            }
            DecompileResults res = di.decompileFunction(f, 120, monitor);
            out.println("// ==== " + f.getName() + " @ " + f.getEntryPoint() + " (содержит " + arg + ") ====");
            if (res.decompileCompleted()) {
                out.println(res.getDecompiledFunction().getC());
            } else {
                out.println("// ошибка: " + res.getErrorMessage());
            }
            out.println();
            println("декомпилирован " + f.getName() + " @ " + f.getEntryPoint());
        }
        out.close();
        di.dispose();
    }
}
