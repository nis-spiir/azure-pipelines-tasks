type BashTelemetry = {
    foundPrefixes: number,
    quottedBlocks: number,
    variablesExpanded: number,
    escapedVariables: number,
    escapedEscapingSymbols: number,
    variablesStartsFromES: number,
    braceSyntaxEntries: number,
    bracedVariables: number,
    // possibly blockers
    variablesWithESInside: number,
    // blockers
    unmatchedQuotes: number, // like "Hello, world!
    notClosedBraceSyntaxPosition: number // 0 means no this issue
}

export function processBashEnvVariables(argsLine: string): [string, BashTelemetry] {
    const envPrefix = '$'
    const quote = '\''
    const escapingSymbol = '\\'

    let result = argsLine
    let startIndex = 0
    // backslash - just backslash
    // ES (escaping symbol) - active backslash
    const telemetry = {
        foundPrefixes: 0,
        quottedBlocks: 0,
        variablesExpanded: 0,
        escapedVariables: 0,
        escapedEscapingSymbols: 0,
        variablesStartsFromES: 0,
        braceSyntaxEntries: 0,
        bracedVariables: 0,
        // possibly blockers
        variablesWithESInside: 0,
        // blockers
        unmatchedQuotes: 0, // like "Hello, world!
        notClosedBraceSyntaxPosition: 0 // 0 means no this issue
    }

    while (true) {
        const prefixIndex = result.indexOf(envPrefix, startIndex)
        if (prefixIndex < 0) {
            break;
        }

        telemetry.foundPrefixes++

        if (result[prefixIndex - 1] === escapingSymbol) {
            if (!(result[prefixIndex - 2]) || result[prefixIndex - 2] !== escapingSymbol) {
                startIndex++
                result = result.substring(0, prefixIndex - 1) + result.substring(prefixIndex)

                telemetry.escapedVariables++

                continue
            }

            telemetry.escapedEscapingSymbols++
        }

        const quoteIndex = result.indexOf(quote, startIndex)
        if (quoteIndex >= 0 && prefixIndex > quoteIndex) {
            const nextQuoteIndex = result.indexOf(quote, quoteIndex + 1)
            if (nextQuoteIndex < 0) {
                telemetry.unmatchedQuotes = 1
                // we properly should throw error here
                // throw new Error('Quotes not enclosed.')
                break
            }

            startIndex = nextQuoteIndex + 1

            telemetry.quottedBlocks++

            continue
        }

        let envName = '';
        let envEndIndex = 0;
        let isBraceSyntax = false

        if (result[prefixIndex + 1] === '{') {
            isBraceSyntax = true

            telemetry.braceSyntaxEntries++
        }

        const envStartIndex = prefixIndex + envPrefix.length + +isBraceSyntax

        if (isBraceSyntax) {
            envEndIndex = findEnclosingBraceIndex(result, prefixIndex)
            if (envEndIndex === 0) {
                // startIndex++

                telemetry.notClosedBraceSyntaxPosition = prefixIndex + 1 // +{
                // throw new Error(...)
                break;
                // continue
            }

            envName = result.substring(envStartIndex, envEndIndex)

            telemetry.bracedVariables++
        } else {
            envName = result.substring(envStartIndex).split(/[ |"|'|;]/)[0]
            envEndIndex = envStartIndex + envName.length
        }

        if (envName.startsWith(escapingSymbol)) {
            const sanitizedEnvName = '$' + (isBraceSyntax ? '{' : '') + envName.substring(1) + (isBraceSyntax ? '}' : '')
            result = result.substring(0, prefixIndex) + sanitizedEnvName + result.substring(envEndIndex + +isBraceSyntax)
            startIndex = prefixIndex + sanitizedEnvName.length

            telemetry.variablesStartsFromES++

            continue
        }

        let head = result.substring(0, prefixIndex)
        if (envName.includes(escapingSymbol)) {
            head = head + envName.split(escapingSymbol)[1]
            envName = envName.split(escapingSymbol)[0]

            telemetry.variablesWithESInside++
        }

        const envValue = process.env[envName] ?? '';
        const tail = result.substring(envEndIndex + +isBraceSyntax)

        result = head + envValue + tail
        startIndex = prefixIndex + envValue.length

        telemetry.variablesExpanded++

        continue
    }

    return [result, telemetry]
}

function findEnclosingBraceIndex(input: string, targetIndex: number) {
    for (let i = 0; i < input.length; i++) {
        if (input[i] === "}" && i > targetIndex) {
            return i
        }
    }
    return 0
}
