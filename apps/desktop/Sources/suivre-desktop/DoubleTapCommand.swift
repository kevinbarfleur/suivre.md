import AppKit
import CoreGraphics

/// Detects a double-tap of the Command key, globally.
///
/// A "tap" is Command pressed and released with no other key or modifier in
/// between. Two clean taps within `windowSeconds` fire `onTrigger`. This can't be
/// done with the Carbon hot-key API (it needs a real key+modifier combo), so it
/// uses a listen-only CGEventTap — which requires the one-time Input Monitoring
/// grant. Using a tap (rather than an NSEvent monitor) keeps the permission
/// coherent: `CGRequestListenEventAccess` governs exactly this mechanism.
final class DoubleTapCommand {
    var onTrigger: () -> Void = {}

    private let windowSeconds: TimeInterval = 0.30
    private var lastTapAt: TimeInterval = 0
    private var commandDown = false
    private var cleanStart = false
    private var otherKeyWhileDown = false

    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var retryTimer: Timer?
    private var retryCount = 0

    func start() {
        if !CGPreflightListenEventAccess() {
            // Triggers the Input Monitoring prompt on first launch.
            CGRequestListenEventAccess()
        }
        installTap()
    }

    /// Creates the tap. If the grant isn't in place yet, `tapCreate` returns nil;
    /// we retry on a timer so the hotkey starts working as soon as it's granted,
    /// without relaunching the app.
    private func installTap() {
        guard eventTap == nil else { return }

        let mask = (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue)
        let callback: CGEventTapCallBack = { _, type, event, userInfo in
            if let userInfo {
                let owner = Unmanaged<DoubleTapCommand>.fromOpaque(userInfo).takeUnretainedValue()
                owner.handle(type: type, flags: event.flags)
            }
            return Unmanaged.passUnretained(event)
        }

        guard
            let tap = CGEvent.tapCreate(
                tap: .cgSessionEventTap,
                place: .headInsertEventTap,
                options: .listenOnly,
                eventsOfInterest: CGEventMask(mask),
                callback: callback,
                userInfo: Unmanaged.passUnretained(self).toOpaque()
            )
        else {
            scheduleRetry()
            return
        }

        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        eventTap = tap
        runLoopSource = source
        retryTimer?.invalidate()
        retryTimer = nil
    }

    /// Re-attempt tap creation on demand (e.g. after the user may have granted
    /// Input Monitoring). No-op if the tap is already running.
    func retryIfNeeded() {
        guard eventTap == nil else { return }
        retryCount = 0
        installTap()
    }

    /// Retry on a timer, but bounded — if the grant never comes we stop after a
    /// minute rather than waking up forever. `retryIfNeeded()` restarts it.
    private func scheduleRetry() {
        guard retryTimer == nil else { return }
        retryCount = 0
        retryTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] timer in
            guard let self else {
                timer.invalidate()
                return
            }
            self.retryCount += 1
            self.installTap()
            if self.eventTap != nil || self.retryCount >= 30 {
                timer.invalidate()
                self.retryTimer = nil
            }
        }
    }

    private func handle(type: CGEventType, flags: CGEventFlags) {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap = eventTap {
                CGEvent.tapEnable(tap: tap, enable: true)
            }
            return
        }

        if type == .keyDown {
            // A real key while Command is held means a shortcut, not a clean tap.
            if commandDown { otherKeyWhileDown = true }
            return
        }

        // flagsChanged
        let commandIsDown = flags.contains(.maskCommand)
        let others: CGEventFlags = [.maskShift, .maskAlternate, .maskControl, .maskSecondaryFn]
        let hasOther = !flags.isDisjoint(with: others)

        if commandIsDown, !commandDown {
            // Command just went down: a tap may be starting.
            commandDown = true
            cleanStart = !hasOther
            otherKeyWhileDown = false
        } else if !commandIsDown, commandDown {
            // Command just came up: the tap ends here.
            commandDown = false
            let clean = cleanStart && !otherKeyWhileDown && !hasOther
            guard clean else {
                lastTapAt = 0
                return
            }
            let now = ProcessInfo.processInfo.systemUptime
            if now - lastTapAt <= windowSeconds {
                lastTapAt = 0
                onTrigger()
            } else {
                lastTapAt = now
            }
        }
    }
}
