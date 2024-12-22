use v5.40;
use utf8;
use Test::More;
use FindBin;
use lib "$FindBin::Bin/lib";
use Util qw(run detect_version);
use File::Spec;
use version qw(qv);

my ($version, $distribution) = detect_version('root', 'very-very-secret');
my $command = 'mysql';
my @ssl_options;
if ($distribution eq 'mysql') {
    if (qv($version) ge "5.7.0") {
        # --ssl-mode is available from MySQL 5.7
        @ssl_options = ('--ssl-mode=VERIFY_IDENTITY');
    } else {
        @ssl_options = ('--ssl', '--ssl-verify-server-cert');
    }
} elsif ($distribution eq 'mariadb') {
    $command = qv($version) lt "10.5.0" ? 'mysql' : 'mariadb';
    @ssl_options = ('--ssl', '--ssl-verify-server-cert');
}

subtest 'connect 127.0.0.1' => sub {
    local $ENV{MYSQL_PWD} = 'very-very-secret';
    my @command = ($command, '--host=127.0.0.1', '--user=root', @ssl_options, '-e', "SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    my $cipher = run(@command);
    like $cipher, qr/^Ssl_cipher\s+\S+\s*$/m, 'Ssl_cipher is set';
};

subtest 'connect ::1' => sub {
    local $ENV{MYSQL_PWD} = 'very-very-secret';
    my @command = ($command, '--host=::1', '--user=root', @ssl_options, '-e', "SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    my $cipher = run(@command);
    like $cipher, qr/^Ssl_cipher\s+\S+\s*$/m, 'Ssl_cipher is set';
};

subtest 'connect localhost' => sub {
    local $ENV{MYSQL_PWD} = 'very-very-secret';
    my @command = ($command, '--host=localhost', '--user=root', @ssl_options, '-e', "SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    my $cipher = run(@command);
    like $cipher, qr/^Ssl_cipher\s+\S+\s*$/m, 'Ssl_cipher is set';
};

done_testing;
