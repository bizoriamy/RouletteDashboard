param(
    [string]$DashboardUrl = 'http://127.0.0.1:8765',
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$source = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

public sealed class RouletteQuickEntryForm : Form
{
    private const int WM_HOTKEY = 0x0312;
    private const int HOTKEY_ID = 0x5251;
    private const uint MOD_CONTROL = 0x0002;
    private const uint VK_Q = 0x51;
    private readonly string endpoint;
    private readonly Label statusLabel;
    private readonly TextBox numberBox;
    private readonly FlowLayoutPanel historyPanel;
    private bool allowVisible;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint key);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    public RouletteQuickEntryForm(string dashboardUrl)
    {
        endpoint = dashboardUrl.TrimEnd('/') + "/api/quick-entry";
        Text = "Quick Roulette Entry";
        TopMost = true;
        ShowInTaskbar = false;
        FormBorderStyle = FormBorderStyle.FixedToolWindow;
        StartPosition = FormStartPosition.Manual;
        ClientSize = new Size(650, 224);
        BackColor = Color.FromArgb(244, 247, 252);
        Font = new Font("Segoe UI", 9F);
        KeyPreview = true;

        var heading = new Label {
            Text = "QUICK SPIN - Ctrl+Q",
            Location = new Point(12, 9), AutoSize = true,
            Font = new Font("Segoe UI Semibold", 9F), ForeColor = Color.FromArgb(31, 73, 125)
        };
        statusLabel = new Label {
            Text = "Choose 0-36",
            Location = new Point(173, 9), Size = new Size(225, 22),
            TextAlign = ContentAlignment.MiddleLeft, ForeColor = Color.DimGray
        };
        numberBox = new TextBox {
            Location = new Point(420, 6), Size = new Size(55, 25),
            MaxLength = 2, TextAlign = HorizontalAlignment.Center
        };
        var enterButton = new Button {
            Text = "Enter", Location = new Point(480, 5), Size = new Size(62, 27),
            BackColor = Color.FromArgb(37, 99, 235), ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        enterButton.FlatAppearance.BorderSize = 0;
        enterButton.Click += delegate { SubmitTyped(); };
        numberBox.KeyPress += delegate(object sender, KeyPressEventArgs e) {
            if (!char.IsControl(e.KeyChar) && !char.IsDigit(e.KeyChar)) e.Handled = true;
        };
        numberBox.KeyDown += delegate(object sender, KeyEventArgs e) {
            if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; SubmitTyped(); }
        };
        var undoButton = new Button {
            Text = "Undo", Location = new Point(548, 5), Size = new Size(90, 27),
            BackColor = Color.White, ForeColor = Color.FromArgb(37, 70, 120), FlatStyle = FlatStyle.Flat
        };
        undoButton.FlatAppearance.BorderColor = Color.FromArgb(170, 185, 205);
        undoButton.Click += delegate { UndoLast(); };
        Controls.Add(heading); Controls.Add(statusLabel); Controls.Add(numberBox); Controls.Add(enterButton); Controls.Add(undoButton);

        historyPanel = new FlowLayoutPanel {
            Location = new Point(10, 39), Size = new Size(630, 28), WrapContents = false,
            FlowDirection = FlowDirection.LeftToRight, BackColor = Color.FromArgb(232, 237, 246), Padding = new Padding(4, 2, 2, 2)
        };
        Controls.Add(historyPanel);

        var grid = new TableLayoutPanel {
            Location = new Point(10, 73), Size = new Size(630, 140),
            ColumnCount = 13, RowCount = 3, Margin = Padding.Empty,
            BackColor = Color.FromArgb(220, 226, 235)
        };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 42));
        for (int i = 1; i < 13; i++) grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 8.3333F));
        for (int row = 0; row < 3; row++) grid.RowStyles.Add(new RowStyle(SizeType.Percent, 33.3333F));

        var zero = CreateNumberButton(0, Color.FromArgb(16, 145, 80));
        grid.Controls.Add(zero, 0, 0); grid.SetRowSpan(zero, 3);
        for (int number = 1; number <= 36; number++) {
            int column = ((number - 1) / 3) + 1;
            int row = 3 - (((number - 1) % 3) + 1);
            grid.Controls.Add(CreateNumberButton(number, NumberColor(number)), column, row);
        }
        Controls.Add(grid);

        KeyDown += delegate(object sender, KeyEventArgs e) {
            if (e.KeyCode == Keys.Escape) { e.SuppressKeyPress = true; HidePopup(); }
        };
        FormClosing += delegate(object sender, FormClosingEventArgs e) {
            if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; HidePopup(); }
        };
    }

    protected override void SetVisibleCore(bool value)
    {
        if (!allowVisible) value = false;
        base.SetVisibleCore(value);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        if (!RegisterHotKey(Handle, HOTKEY_ID, MOD_CONTROL, VK_Q)) {
            MessageBox.Show("Ctrl+Q is already being used by another program.", "Quick Roulette Entry",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    protected override void OnHandleDestroyed(EventArgs e)
    {
        UnregisterHotKey(Handle, HOTKEY_ID);
        base.OnHandleDestroyed(e);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_HOTKEY && m.WParam.ToInt32() == HOTKEY_ID) {
            ShowPopup();
            return;
        }
        base.WndProc(ref m);
    }

    private Button CreateNumberButton(int number, Color color)
    {
        var button = new Button {
            Text = number.ToString(), Dock = DockStyle.Fill, Margin = new Padding(1),
            BackColor = color, ForeColor = Color.White, FlatStyle = FlatStyle.Flat,
            Font = new Font("Segoe UI Semibold", 9F), TabStop = false
        };
        button.FlatAppearance.BorderSize = 0;
        button.Click += delegate { SubmitNumber(number); };
        return button;
    }

    private static Color NumberColor(int number)
    {
        int[] reds = {1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36};
        return Array.IndexOf(reds, number) >= 0 ? Color.FromArgb(210, 42, 51) : Color.FromArgb(35, 40, 47);
    }

    private void ShowPopup()
    {
        allowVisible = true;
        Rectangle area = Screen.FromPoint(Cursor.Position).WorkingArea;
        int x = Math.Min(Math.Max(area.Left, Cursor.Position.X - Width / 2), area.Right - Width);
        int y = Math.Min(Math.Max(area.Top, Cursor.Position.Y - Height / 2), area.Bottom - Height);
        Location = new Point(x, y);
        numberBox.Clear();
        statusLabel.Text = "Choose 0-36";
        RefreshHistory();
        Show(); BringToFront(); Activate(); numberBox.Focus();
    }

    private void HidePopup()
    {
        Hide();
        allowVisible = false;
    }

    private void SubmitTyped()
    {
        int number;
        if (!int.TryParse(numberBox.Text, out number) || number < 0 || number > 36) {
            statusLabel.Text = "Enter a number from 0 to 36";
            numberBox.SelectAll(); numberBox.Focus();
            return;
        }
        SubmitNumber(number);
    }

    private void UndoLast()
    {
        try {
            using (var client = new WebClient()) {
                client.Encoding = Encoding.UTF8;
                client.Headers[HttpRequestHeader.ContentType] = "application/json";
                client.UploadString(endpoint, "POST", "{\"action\":\"undo\"}");
            }
            statusLabel.Text = "Undo requested";
            RefreshHistory();
            numberBox.Focus();
        } catch (Exception ex) {
            MessageBox.Show("Undo was not sent.\n\n" + ex.Message, "Quick Roulette Entry",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void RefreshHistory()
    {
        try {
            string json;
            using (var client = new WebClient()) {
                client.Encoding = Encoding.UTF8;
                json = client.DownloadString(endpoint + "?after=2147483647");
            }
            var match = Regex.Match(json, "\\\"history\\\"\\s*:\\s*\\[([^\\]]*)\\]");
            historyPanel.Controls.Clear();
            historyPanel.Controls.Add(new Label {
                Text = "Recent", AutoSize = false, Size = new Size(48, 21),
                TextAlign = ContentAlignment.MiddleLeft, ForeColor = Color.DimGray, Margin = new Padding(0)
            });
            if (!match.Success || String.IsNullOrWhiteSpace(match.Groups[1].Value)) return;
            string[] values = match.Groups[1].Value.Split(',');
            for (int i = values.Length - 1; i >= 0; i--) {
                int number;
                if (!int.TryParse(values[i].Trim(), out number)) continue;
                var item = new Label {
                    Text = number.ToString(), AutoSize = false, Size = new Size(38, 21),
                    TextAlign = ContentAlignment.MiddleCenter, BackColor = number == 0 ? Color.FromArgb(16,145,80) : NumberColor(number),
                    ForeColor = Color.White, Font = new Font("Segoe UI Semibold", 8F), Margin = new Padding(1,0,1,0)
                };
                historyPanel.Controls.Add(item);
            }
        } catch {
            historyPanel.Controls.Clear();
            historyPanel.Controls.Add(new Label { Text = "Recent history unavailable", AutoSize = true, ForeColor = Color.DimGray });
        }
    }
    private void SubmitNumber(int number)
    {
        try {
            statusLabel.Text = "Sending " + number + "...";
            using (var client = new WebClient()) {
                client.Encoding = Encoding.UTF8;
                client.Headers[HttpRequestHeader.ContentType] = "application/json";
                client.UploadString(endpoint, "POST", "{\"number\":" + number + "}");
            }
            statusLabel.Text = "Last sent: " + number;
            numberBox.Clear();
            RefreshHistory();
            numberBox.Focus();
        } catch (Exception ex) {
            statusLabel.Text = "Dashboard unavailable";
            MessageBox.Show("The number was not entered.\n\nOpen the Roulette Dashboard and try again.\n\n" + ex.Message,
                "Quick Roulette Entry", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            numberBox.Focus();
        }
    }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Net
if ($SelfTest) {
    $form = New-Object RouletteQuickEntryForm($DashboardUrl)
    $form.Dispose()
    Write-Output 'Quick Entry helper compiled successfully.'
    exit 0
}

[Windows.Forms.Application]::EnableVisualStyles()
$app = New-Object RouletteQuickEntryForm($DashboardUrl)
# A hidden form does not always create its native handle automatically. The
# handle must exist before the global Ctrl+Q registration can receive messages.
$null = $app.Handle
Add-Content -LiteralPath (Join-Path $env:TEMP 'roulette-quick-entry.log') -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Quick Entry handle ready: $($app.Handle)" -Encoding UTF8
[Windows.Forms.Application]::Run()
